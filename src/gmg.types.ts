export type AccessoryContext = {
  smoker: Smoker
  tempDisplayUnit: number
}

export type Smoker = {
  deviceModel: string
  ipAddress: string
  deviceId: string
  status: Status
  firmware: string
}

// GMG client types
export type Status = {
  state: string
  isOn : boolean
  currentGrillTemp: number
  desiredGrillTemp: number
  currentFoodTemp: number
  desiredFoodTemp: number
  fanModeActive: boolean
  lowPelletAlarmActive: boolean
}

export type CommandResponse = {
  msg: string
}
