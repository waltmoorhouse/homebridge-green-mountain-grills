import { Logging } from 'homebridge'
import {Smoker, Status} from './gmg.types'
import GMGClient from './GMGClient'

export class SmokerService {
  private readonly log: Logging
  private readonly gmgClient: any

  constructor(log: Logging, ipAddress: string) {
    this.log = log
    this.gmgClient = new GMGClient({host: ipAddress, logger: log})
  }

  async getSmoker(): Promise<Smoker> {
    try {
      const modafw = await this.gmgClient.getGrillModelAndFirmware()
      return {
        ipAddress: await this.gmgClient.discoverGrill(),
        deviceId: await this.gmgClient.getGrillId(),
        status: await this.gmgClient.getGrillStatus(),
        deviceModel: modafw.model,
        firmware: modafw.firmware
      }
    } catch (e) {
      this.log.error(e)
      return Promise.reject(e)
    }
  }

  async getStatus(): Promise<Status> {
    return this.gmgClient.getGrillStatus()
  }

  turnGrillOn() {
    this.gmgClient.powerOnGrill()
  }

  turnGrillOff() {
    this.gmgClient.powerOffGrill()
  }

  setFoodTemp(value: number) {
    this.gmgClient.setFoodTemp(value)
  }

  setGrillTemp(value: number) {
    this.gmgClient.setGrillTemp(value)
  }
}
