import {
  API,
  APIEvent,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge'
import {PLATFORM_NAME, PLUGIN_NAME} from './settings'
import {GMGPlatformAccessory} from './platform-accessory'
import crypto from 'crypto'
import {SmokerService} from './gmg-service'
import {AccessoryContext, Smoker} from './gmg.types'

export class GMGPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

  readonly smokerService: SmokerService | undefined
  private cachedAccessories: PlatformAccessory[] = []
  private readonly smokers: Map<string, GMGPlatformAccessory> = new Map()
  private alreadyPolling = false

  constructor(
    readonly log: Logging,
    public config: PlatformConfig,
    private readonly api: API,
  ) {
    try {
      this.smokerService = new SmokerService(log, config.ipAddress)

      if (!config.pollSeconds || Number.isNaN(config.pollSeconds) || Number(config.pollSeconds) < 1) {
        this.config.pollSeconds = 30
      }
      log.info(PLATFORM_NAME + ' finished initializing!')

      /*
       * When this event is fired, homebridge restored all cached accessories from disk and did call their respective
       * `configureAccessory` method for all of them. Dynamic Platform plugins should only register new accessories
       * after this event was fired, in order to ensure they weren't added to homebridge already.
       * This event can also be used to start discovery of new accessories.
       */
      api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
        log.info(PLATFORM_NAME + ' finished launching!')
        this.discover()
          .then(() => this.log.info('Discovery action completed'))
      })
    } catch (e) {
      this.log.error(e)
    }
  }

  async discover(): Promise<void> {
    try {
      this.log.info('Discovering Grills')
      // Get smokers from API
      const smokers = [await this.smokerService!.getSmoker()]

      // Remove all cached smokers
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.cachedAccessories)

      // Register smokers
      smokers.forEach(this.register.bind(this))

      // We don't want to set another interval for the poller if we're already running it.
      if (!this.alreadyPolling) {
        this.alreadyPolling = true
        // poll again after configured time.
        setInterval(this.pollForNewData.bind(this), Number(this.config.pollSeconds) * 1000)
      }
    } catch (e) {
      this.log.error(e)
    }
  }

  private async register(smoker: Smoker) {
    try {
      this.log.info(`Discovered GMG Smoker: ${smoker.deviceId}.`)
      const uuid = this.generate(smoker.deviceId)
      // create a new accessory
      const accessory = new this.api.platformAccessory('Grill', uuid)

      // Add context to accessory
      const context = accessory.context as AccessoryContext
      context.smoker = smoker

      // Initialize the controller
      this.smokers.set(context.smoker.deviceId, new GMGPlatformAccessory(this, accessory))

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      this.log.info(`Device ${smoker.deviceId} has been registered!`)
    } catch (e) {
      this.log.error(e)
    }
  }

  private pollForNewData() {
    try {
      this.log.info('Updating smoker status.')
      // Update device attributes
      for (const key of this.smokers.keys()) {
        const smoker = this.smokers.get(key)!
        smoker.pollForNewData()
      }
    } catch (e) {
      this.log.error(e)
    }
  }

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    try {
      this.log.info('Loading accessory from cache:', accessory.displayName)
      // add the restored accessory to the accessories cache, so we can track if it has already been registered
      this.cachedAccessories.push(accessory)
    } catch (e) {
      this.log.error(e)
    }
  }

  private generate(deviceSerialNumber: string) {
    const sha1sum = crypto.createHash('sha1')
    sha1sum.update(deviceSerialNumber)
    const s = sha1sum.digest('hex')
    let i = -1
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      i += 1
      switch (c) {
        case 'y':
          return ((parseInt('0x' + s[i], 16) & 0x3) | 0x8).toString(16)
        case 'x':
        default:
          return s[i]
      }
    })
  }
}
