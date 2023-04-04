import {Characteristic, CharacteristicValue, Formats, Perms, PlatformAccessory, PlatformAccessoryEvent, Service, Units} from 'homebridge'

import {GMGPlatform} from './dynamic-platform'
import {AccessoryContext} from './gmg.types'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class GMGPlatformAccessory {
  public context: AccessoryContext
  private mainPowerService: Service
  private grillThermostatService: Service
  private foodTemperatureService: Service
  private pelletAlarmService: Service
  private fanService: Service
  private currentCookingTemperatureCharacteristic: Characteristic
  private targetCookingTemperatureCharacteristic: Characteristic
  private currentFoodTemperatureCharacteristic: Characteristic
  private targetFoodTemperatureCharacteristic: Characteristic

  constructor(
    readonly platform: GMGPlatform,
    readonly accessory: PlatformAccessory,
  ) {
    this.context = accessory.context as AccessoryContext
    this.context.tempDisplayUnit = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
    const smoker = this.context.smoker

    // Custom Characteristics
    this.currentCookingTemperatureCharacteristic = new this.platform.Characteristic('Current Cooking Temperature',
      '42010000-0000-1000-8000-0026BB765291',
      {
        format: Formats.FLOAT,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: Units.CELSIUS,
        minValue: 0,
        maxValue: 1000,
        minStep: 0.1,
      })

    this.targetCookingTemperatureCharacteristic = new this.platform.Characteristic('Target Cooking Temperature',
      '42000001-0000-1000-8000-0026BB765291',
      {
        format: Formats.FLOAT,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ, Perms.PAIRED_WRITE],
        unit: Units.CELSIUS,
        minValue: 0,
        maxValue: 1000,
        minStep: 0.1,
      })

    this.currentFoodTemperatureCharacteristic = new this.platform.Characteristic('Current Food Temperature',
      '42000010-0000-1000-8000-0026BB765291',
      {
        format: Formats.FLOAT,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
        unit: Units.CELSIUS,
        minValue: 0,
        maxValue: 260,
        minStep: 0.1,
      })

    this.targetFoodTemperatureCharacteristic = new this.platform.Characteristic('Target Food Temperature',
      '42000011-0000-1000-8000-0026BB765291',
      {
        format: Formats.FLOAT,
        perms: [Perms.NOTIFY, Perms.PAIRED_READ, Perms.PAIRED_WRITE],
        unit: Units.CELSIUS,
        minValue: 0,
        maxValue: 260,
        minStep: 0.1,
      })

    // set accessory information
    const informationService = accessory.getService(this.platform.Service.AccessoryInformation)!
    informationService
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Green Mountain Grills')
      .setCharacteristic(this.platform.Characteristic.Model, smoker.deviceModel)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, smoker.deviceId)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, smoker.firmware)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, smoker.deviceModel)

    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.platform.log.info('%s identified!', accessory.displayName)
    })

    // Master switch
    this.mainPowerService = accessory.getService(this.platform.Service.Switch) ||
      accessory.addService(this.platform.Service.Switch)
    this.mainPowerService.setCharacteristic(this.platform.Characteristic.Name, 'Grill Power')
    this.mainPowerService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getMainPowerState.bind(this))
      .onSet(this.setGrillMainPower.bind(this))
    // Alarm State for Low Pellet Alarm
    this.pelletAlarmService = accessory.getService(this.platform.Service.SmokeSensor) ||
      accessory.addService(this.platform.Service.SmokeSensor)
    this.pelletAlarmService.setCharacteristic(this.platform.Characteristic.Name, 'Pellet Low Alert')
    this.pelletAlarmService.getCharacteristic(this.platform.Characteristic.SmokeDetected)
      .onGet(this.getPelletAlarmIsActive.bind(this))
    // Adjustable Thermostat for Desired Grill Temp
    this.grillThermostatService = accessory.getService('Grill Temp') ||
      accessory.addService(this.platform.Service.Thermostat, 'Grill Temp', 'Grill Temp')
    this.grillThermostatService.setCharacteristic(this.platform.Characteristic.Name, 'Grill Temp')
    this.grillThermostatService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentPowerState.bind(this))
    this.grillThermostatService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetPowerState.bind(this))
      .onSet(this.setGrillPower.bind(this))
    this.grillThermostatService.addCharacteristic(this.currentCookingTemperatureCharacteristic)
      .onGet(this.getCurrentGrillTemp.bind(this))
    this.grillThermostatService.addCharacteristic(this.targetCookingTemperatureCharacteristic)
      .onGet(this.getTargetGrillTemp.bind(this))
      .onSet(this.setGrillTemp.bind(this))
    this.grillThermostatService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this))
    // Adjustable Thermostat for Desired Food Temp
    this.foodTemperatureService = accessory.getService('Food Temp') ||
      accessory.addService(this.platform.Service.Thermostat, 'Food Temp', 'Food Temp')
    this.foodTemperatureService.setCharacteristic(this.platform.Characteristic.Name, 'Food Temp')
    this.foodTemperatureService.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getFoodProbeState.bind(this))
    this.foodTemperatureService.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getFoodProbeState.bind(this))
    this.foodTemperatureService.addCharacteristic(this.currentFoodTemperatureCharacteristic)
      .onGet(this.getCurrentFoodTemp.bind(this))
    this.foodTemperatureService.addCharacteristic(this.targetFoodTemperatureCharacteristic)
      .onGet(this.getTargetFoodTemp.bind(this))
      .onSet(this.setFoodTemp.bind(this))
    this.foodTemperatureService.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.getTargetFoodTemp.bind(this))
      .onSet(this.setFoodTemp.bind(this))
    this.foodTemperatureService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this))

    // Fan for Fan Mode Active
    this.fanService = accessory.getService(this.platform.Service.Fan) || accessory.addService(this.platform.Service.Fan)
    this.fanService.setCharacteristic(this.platform.Characteristic.Name, 'Fan Mode')
    this.fanService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getFanState.bind(this))
  }

  pollForNewData() {
    this.platform.smokerService.getStatus()
      .then(status => {
        if (status) {
          this.context.smoker.status = status
          this.pelletAlarmService.updateCharacteristic(this.platform.Characteristic.SmokeDetected, this.getPelletAlarmIsActive())

          this.grillThermostatService.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState,
            this.getCurrentPowerState())
          this.grillThermostatService.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState,
            this.getTargetPowerState())
          this.grillThermostatService.updateCharacteristic(this.currentCookingTemperatureCharacteristic.displayName,
            this.getCurrentGrillTemp())
          this.grillThermostatService.updateCharacteristic(this.targetCookingTemperatureCharacteristic.displayName,
            this.getTargetGrillTemp())

          this.foodTemperatureService.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState,
            this.getFoodProbeState())
          this.foodTemperatureService.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState,
            this.getFoodProbeState())
          this.foodTemperatureService.updateCharacteristic(this.currentFoodTemperatureCharacteristic.displayName, this.getCurrentFoodTemp())
          this.foodTemperatureService.updateCharacteristic(this.targetFoodTemperatureCharacteristic.displayName, this.getTargetFoodTemp())
        }
      })
      .catch(err => this.platform.log.error(err))
  }

  getFanState(): CharacteristicValue {
    return this.context.smoker.status.fanModeActive
  }

  getFoodProbeState(): CharacteristicValue {
    return this.context.smoker.status.desiredFoodTemp === 10 ?
      this.platform.Characteristic.CurrentHeatingCoolingState.OFF :
      this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
  }

  getPelletAlarmIsActive(): CharacteristicValue {
    return this.context.smoker.status.lowPelletAlarmActive ?
      this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED :
      this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED
  }

  getCurrentPowerState(): CharacteristicValue {
    if (this.context.smoker.status.isOn) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
    }
    if (this.context.smoker.status.fanModeActive) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL
    }
    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF
  }

  getMainPowerState(): CharacteristicValue {
    return this.context.smoker.status.isOn
  }

  getTargetPowerState(): CharacteristicValue {
    if (this.context.smoker.status.isOn) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
    }
    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF
  }

  getCurrentGrillTemp(): CharacteristicValue {
    return this.context.smoker.status.currentGrillTemp
  }

  getTargetGrillTemp(): CharacteristicValue {
    return this.context.smoker.status.desiredGrillTemp
  }

  getCurrentFoodTemp(): CharacteristicValue {
    return this.context.smoker.status.currentFoodTemp
  }

  getTargetFoodTemp(): CharacteristicValue {
    return this.context.smoker.status.desiredFoodTemp
  }

  getTemperatureDisplayUnits(): CharacteristicValue {
    return this.context.tempDisplayUnit
  }

  async setTemperatureDisplayUnits(value: CharacteristicValue): Promise<void> {
    this.context.tempDisplayUnit = Number(value)
  }

  async setGrillMainPower(value: CharacteristicValue): Promise<void> {
    if (value &&
      !this.context.smoker.status.isOn &&
      !this.context.smoker.status.fanModeActive
    ) {
      this.platform.smokerService.turnGrillOn()
    }
    if (!value && this.context.smoker.status.isOn) {
      this.platform.smokerService.turnGrillOff()
    }
  }

  async setGrillPower(value: CharacteristicValue): Promise<void> {
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT &&
      !this.context.smoker.status.isOn &&
      !this.context.smoker.status.fanModeActive
    ) {
      this.platform.smokerService.turnGrillOn()
    }
    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF && this.context.smoker.status.isOn) {
      this.platform.smokerService.turnGrillOff()
    }
  }

  async setGrillTemp(value: CharacteristicValue): Promise<void> {
    this.platform.smokerService.setGrillTemp(Number(value))
  }

  async setFoodTemp(value: CharacteristicValue): Promise<void> {
    this.platform.smokerService.setFoodTemp(Number(value))
  }
}
