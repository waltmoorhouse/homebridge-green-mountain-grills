import {Logging} from 'homebridge'
import dgram from 'dgram'
import {CommandResponse} from './gmg.types'
import GrillStatus from './GrillStatus'

const commands = Object.freeze({
  powerOn: 'UK001!',
  powerOff: 'UK004!',
  getGrillStatus: 'UR001!',
  getGrillModel: 'UN!',
  getGrillId: 'UL!',
  setGrillTempF: (temp) => `UT${temp}!`,
  setFoodTempF: (temp) => `UF${temp}!`
})

const results = Object.freeze({
  OK: 'OK'
})

class GMGClient {
  private port = 8080
  private host = '255.255.255.255'
  private tries = 5
  private retryMs = 2000
  private _logger: (message: string) => void

  constructor(param: {
    logger: Logging;
    host?: string;
    port?: number;
    tries?: number;
    retryMs?: number
  }) {
    if (param.port) {
      this.port = param.port
    }
    if (param.host) {
      this.host = param.host
    }
    if (param.tries) {
      this.tries = param.tries
    }
    if (param.retryMs) {
      this.retryMs = param.retryMs
    }
    this._logger = (message) => param.logger.info(message)
  }

  private getCommandData(command): Buffer {
    const fullCommand = `${command}!\n`
    return Buffer.from(fullCommand, 'ascii')
  }

  async getGrillId() {
    const result = await this.sendCommand(commands.getGrillId)
    return result.msg.toString()
  }

  async getGrillModelAndFirmware() {
    try {
      const result = (await this.sendCommand(commands.getGrillModel)).msg.toString()
      const fw = result.substring(11)
      switch(result.substring(2, 4)) {
        case 'DB': return {model: 'Daniel Boone', firmware: fw}
        case 'JB':
          return {model: 'Jim Bowie', firmware: fw}
        default:
          return {model: 'Unknown', firmware: result}
      }
    } catch (e) {
      this._logger(e)
    }
  }

  async getGrillStatus() {
    try {
      const result = await this.sendCommand(commands.getGrillStatus)
      return new GrillStatus(result.msg)
    } catch (e) {
      this._logger(e)
    }
  }

  async powerToggleGrill() {
    const status = await this.getGrillStatus()
    if (status?.isOn) {
      await this._powerOffGrill(status)
    } else {
      await this._powerOnGrill(status)
    }
  }

  async powerOffGrill() {
    const status = await this.getGrillStatus()
    await this._powerOffGrill(status)
  }

  async powerOnGrill() {
    const status = await this.getGrillStatus()
    await this._powerOnGrill(status)
  }

  async setGrillTemp(fahrenheit) {
    const status = await this.getGrillStatus()
    if (!status?.isOn) {
      const error = new Error('Cannot set grill temperature when the gill is off!')
      this._logger(error.message)
      throw error
    }

    const command = commands.setGrillTempF(fahrenheit)
    const result = await this.sendCommand(command)
    await this._validateResult(result, newState => newState.desiredGrillTemp === fahrenheit)
  }

  async setFoodTemp(fahrenheit) {
    const status = await this.getGrillStatus()
    if (!status?.isOn) {
      const error = new Error('Cannot set food temperature when the gill is off!')
      this._logger(error.message)
      throw error
    }

    const command = commands.setFoodTempF(fahrenheit)
    const result = await this.sendCommand(command)
    await this._validateResult(result, newState => newState.desiredFoodTemp === fahrenheit)
  }

  async discoverGrill({ tries = this.tries } = {}) {
    return new Promise((res, rej) => {
      let attempts = 0, schedule
      const socket = dgram.createSocket('udp4')
      const data = this.getCommandData(commands.getGrillId)
      const finish = (result) => {
        // eslint-disable-next-line no-undef
        if (schedule) {
          clearInterval(schedule)
        }
        socket.removeAllListeners('message')
        socket.close()
        result instanceof Error ? rej(result) : res(result)
      }

      socket.bind(() => {
        // Listen for response
        socket.setBroadcast(true)
        socket.on('message', (msg, info) => {
          // Make sure the response is not a broadcast to ourself
          if (!msg.equals(data)) {
            this.host = info.address
            finish(this.host)
            this._logger(`Received discovery response dgram from Grill (${info.address}:${info.port})`)
          }
        })

        // Send Commands
        this._logger('Attempting grill discovery...')
        // eslint-disable-next-line no-undef
        schedule = setInterval(() => {
          if (attempts >= tries) {
            const error = new Error(
              `No response from Grill (${this.host}:${this.port}) after [${attempts}] discovery attempts!`)
            finish(error)
            this._logger(error.message)
          } else {
            attempts++
            socket.send(data, 0, data.byteLength, this.port, this.host, error => {
              if (error) {
                this._logger(`Grill (${this.host}:${this.port}) discovery broadcast dgram send failed -> ${error}`)
              } else {
                this._logger(`Grill (${this.host}:${this.port}) discovery broadcast dgram sent -> Attempt #${attempts}`)
              }
            })
          }
        }, this.retryMs)
      })
    })
  }

  async sendCommand(command, { tries = this.tries } = {}): Promise<CommandResponse> {
    if (this.host === '255.255.255.255') {
      this._logger('Grill host is broadcast address!')
      await this.discoverGrill()
    }

    return await new Promise((res, rej) => {
      let attempts = 0
      // eslint-disable-next-line prefer-const
      let schedule
      const data = this.getCommandData(command)
      const socket = dgram.createSocket('udp4')
      const offset = data.byteLength

      const finish = (result) => {
        // eslint-disable-next-line no-undef
        if (schedule) {
          clearInterval(schedule)
        }
        socket.removeAllListeners('message')
        socket.close()
        result instanceof Error ? rej(result) : res(result)
      }

      // Listen for response
      socket.on('message', (msg, info) => {
        if (info.address === this.host) {
          finish({ msg, info })
          this._logger(`Received response dgram from Grill (${info.address}:${info.port})`)
        }
      })

      // Send Commands
      // eslint-disable-next-line no-undef
      schedule = setInterval(() => {
        if (attempts > tries) {
          const error = new Error(`No response from Grill after [${attempts}] command sent attempts!`)
          finish(error)
          this._logger(error.message)
        } else {
          attempts++
          socket.send(data, 0, offset, this.port, this.host, error => {
            if (error) {
              this._logger(`Grill (${this.host}:${this.port}) [${command}] command dgram send failed -> ${error}`)
            } else {
              this._logger(`Grill (${this.host}:${this.port}) [${command}] command dgram sent -> Attempt #${attempts}.`)
            }
          })
        }
      }, this.retryMs)
    })
  }


  async _powerOffGrill(status) {
    if (!status.isOn) {
      return
    }
    const result = await this.sendCommand(commands.powerOff)
    await this._validateResult(result, newState => !newState.isOn)
  }

  async _powerOnGrill(status) {
    if (status.fanModeActive) {
      const error = new Error('Cannot start grill when fan mode is active.')
      this._logger(error.message)
      throw error
    }

    const result = await this.sendCommand(commands.powerOn)
    await this._validateResult(result, newState => newState.isOn)
  }

  async _validateResult(result, _validator) {
    const response = result.msg.toString()
    if (response !== results.OK) {
      throw new Error(`Grill responded with non OK status -> ${response}`)
    }
  }
}

export default GMGClient
