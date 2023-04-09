# Green Mountain Grills HomeBridge Plug-in

## Introduction

This plug-in is meant to connect your Green Mountain Grills WiFi Smoker to HomeBridge, so you can add it to HomeKit. 
Your smoker will need to be in WiFi mode, and discoverable by the app for this to work.

## Configuration

You will need to select the *Polling Interval* (this is how often the
app will poll the GMG to update the device status) which is
measured in seconds. The value must be between 1 and 600. Default is 30.

If you are using DHCP to keep your grill on a certain IP, you can enter that in the *IP Address* field, otherwise
the plugin will attempt to discover the grill automatically.

## GMG Client
The GMG Client library is adapted from https://github.com/Aenima4six2/gmg

## Donations

If you find this useful and have a few extra bucks laying around, 
you can send me some via [PayPal](https://www.paypal.com/paypalme/waltmoorhouse)
or [Venmo](https://venmo.com/?txn=pay&audience=public&recipients=Walt-Moorhouse)
so I can buy more IoT devices.  :-)
