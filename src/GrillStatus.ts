
class GrillStatus {
  private state: string
  private _hex: string
  isOn: boolean
  private currentGrillTemp: number
  private desiredGrillTemp: number
  private currentFoodTemp: number
  private desiredFoodTemp: number
  private fanModeActive: boolean
  private lowPelletAlarmActive: boolean

  constructor(bytes) {
    // eslint-disable-next-line no-undef
    const hex = Buffer.from(bytes).toString('hex')
    this.state = getGrillState(hex)
    this._hex = hex
    this.isOn = this.state === 'on'
    this.currentGrillTemp = convertFtoC(getCurrentGrillTemp(hex))
    this.desiredGrillTemp = this.isOn ? convertFtoC(getDesiredGrillTemp(hex)) : 10
    this.currentFoodTemp = convertFtoC(getCurrentFoodTemp(hex))
    this.desiredFoodTemp = this.isOn ? convertFtoC(getDesiredFoodTemp(hex)) : 10
    this.fanModeActive = this.state === 'fan mode'
    this.lowPelletAlarmActive = getLowPelletAlarmActive(hex)
  }
}

const convertFtoC = (fahrenheit: number) => ((fahrenheit - 32) * 5 / 9)

const getRawValue = (hex, position) => {
  const value = hex.substr(position, 2)
  const parsed = parseInt(value, 16)
  return parsed
}

const getGrillState = (hex) => {
  const statusCharacter = hex.charAt(61)
  const status = parseInt(statusCharacter, 10)
  if (status === 0) {
    return 'off'
  } else if (status === 1) {
    return 'on'
  } else if (status === 2) {
    return 'fan mode'
  } else {
    return 'unknown'
  }
}

const getCurrentGrillTemp = (hex) => {
  const first = getRawValue(hex, 4)
  const second = getRawValue(hex, 6)
  return first + (second * 256)
}

const getLowPelletAlarmActive = (hex) => {
  const first = getRawValue(hex, 48)
  const second = getRawValue(hex, 50)
  const value = first + (second * 256)
  return value === 128
}

const getDesiredGrillTemp = (hex) => {
  const first = getRawValue(hex, 12)
  const second = getRawValue(hex, 14)
  return first + (second * 256)
}

const getCurrentFoodTemp = (hex) => {
  const first = getRawValue(hex, 8)
  const second = getRawValue(hex, 10)
  const currentFoodTemp = first + (second * 256)
  return currentFoodTemp >= 557 ? 0 : currentFoodTemp
}

const getDesiredFoodTemp = (hex) => {
  const first = getRawValue(hex, 56)
  const second = getRawValue(hex, 58)
  return first + (second * 256)
}

export default GrillStatus
