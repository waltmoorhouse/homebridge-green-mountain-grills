import {
  API,
  APIEvent,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service
} from 'homebridge'
import {PLATFORM_NAME, PLUGIN_NAME} from './settings'
import {GMGPlatformAccessory} from './platform-accessory'
import crypto from 'crypto'
import {SmokerService} from './gmg-service'
import {AccessoryContext, Smoker} from './gmg.types'

export class GMGPlatform implements DynamicPlatformPlugin {
  public readonly VERSION = '1.0.0' // This should always match package.json version
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

  readonly smokerService: SmokerService
  private cachedAccessories: PlatformAccessory[] = []
  private readonly smokers: Map<string, GMGPlatformAccessory> = new Map()
  private alreadyPolling = false

  constructor(
    readonly log: Logging,
    public config: PlatformConfig,
    private readonly api: API,
  ) {
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
  }

  async discover(): Promise<void> {
    this.log.info('Discovering Grills')
    // Get smokers from API
    const smokers = [await this.smokerService.getSmoker()]

    // Register Controllers not found in the cache
    smokers.forEach(smoker => {
      // Check to see if controllers already registered in accessories
      let found = false
      for (const accessory of this.cachedAccessories) {
        const ctx = accessory.context as AccessoryContext
        if (smoker.deviceId === ctx.smoker.deviceId) {
          if (this.VERSION === accessory.context.version) {
            found = true
          } else {
            this.log.warn(`Old version of Smoker ${smoker.deviceId} was found, removing so it can be reconfigured.`)
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
            this.cachedAccessories = this.cachedAccessories.filter(cached => cached.UUID !== accessory.UUID)
          }
        }
      }
      if (!found) {
        this.register(smoker).then(() => this.log.debug('smoker registered'))
      }
    })

    // Configure cached controllers that are still registered, and Remove controllers that are no longer registered
    const toBeRemoved: PlatformAccessory[] = []
    this.cachedAccessories.forEach(accessory => {
      const ctx = accessory.context as AccessoryContext
      if (smokers.find(smoker => smoker.deviceId === ctx.smoker.deviceId)) {
        this.log.info('The cached smoker  %s is still registered to this account. Configuring.', ctx.smoker.deviceId)
        this.smokers.set(ctx.smoker.deviceId, new GMGPlatformAccessory(this, accessory))
      } else {
        this.log.info(ctx.smoker.deviceId +
          ' is no longer registered to this account. Removing from homebridge.')
        toBeRemoved.push(accessory)
      }
    })

    if (toBeRemoved.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toBeRemoved)
    }

    // We don't want to set another interval for the poller if we're already running it.
    if (!this.alreadyPolling) {
      this.alreadyPolling = true
      // poll again after configured time.
      setInterval(this.pollForNewData.bind(this), Number(this.config.pollSeconds) * 1000)
    }
  }

  private async register(smoker: Smoker) {
    this.log.info(`Discovered Smoker: ${smoker.deviceId}.`)
    const uuid = this.generate(smoker.deviceId)
    // create a new accessory
    const accessory = new this.api.platformAccessory('GMG Smoker', uuid)

    // Add context to accessory
    const context = accessory.context as AccessoryContext
    context.version = this.VERSION
    context.smoker = smoker

    // Initialize the controller
    this.smokers.set(context.smoker.deviceId, new GMGPlatformAccessory(this, accessory))

    // link the accessory to your platform
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
    this.log.info(`Device ${smoker.deviceId} has been registered!`)
  }

  private pollForNewData() {
    this.log.info('Updating smoker status.')
    // Update device attributes
    for (const key of this.smokers.keys()) {
      const smoker = this.smokers.get(key)!
      smoker.pollForNewData()
    }
  }

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName)
    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.cachedAccessories.push(accessory)
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
