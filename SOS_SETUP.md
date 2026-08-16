# SOS location alert setup

The SOS flow now captures the elderly user's current coordinates and sends an
in-app Socket.IO alert to actively linked caregivers and family members. The
alert includes an interactive OpenStreetMap view, the coordinate accuracy, and
an audible alarm.

## One-time database update

Run `database/sos_location_migration.sql` against the same MySQL database used
by the API before starting the updated backend.

## Flutter dependencies

From the `homecare_app` folder, run:

```sh
flutter pub get
```

Then rebuild the app. Android and iOS foreground-location permission text is
already configured. On the elderly device, allow location access when the SOS
button is used.

## Test

1. Sign in as the linked caregiver or family member and leave the app open.
2. On another device, sign in as the elderly user.
3. Tap the SOS button and allow location access.
4. Confirm that the linked account receives the emergency card, alarm, map pin,
   coordinates, and accuracy radius.

If location permission or device location services are unavailable, the SOS is
still sent immediately and the recipient sees a location-unavailable warning.

This implementation provides real-time notifications while the recipient app
is connected. Receiving an operating-system notification while the app is
fully closed requires a separate push service such as Firebase Cloud Messaging.
