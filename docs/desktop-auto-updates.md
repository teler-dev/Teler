# TELER desktop auto-updates

The first auto-update-enabled TELER build must be distributed manually once. After it has been run from a user-writable folder, it checks the stable release manifest shortly after sign-in.

## Release process

1. Build `TELER.exe` with a higher `DESKTOP_VERSION` in `core/auto_update.py`.
2. Upload the executable to the approved HTTPS release host. The recommended location is the Oracle server under `https://204-216-105-57.sslip.io/releases/`.
3. Calculate its SHA-256 hash.
4. Replace `Teler-Web-main/public/desktop/latest.json` with the new version, download URL, SHA-256, notes and whether it is mandatory.
5. Deploy the web project. The desktop client checks this manifest, downloads only a newer version, verifies the SHA-256, and offers a restart.

## Security limits

The updater requires HTTPS, an approved download host, a numeric higher version and an exact SHA-256 checksum. This prevents accidental or corrupted downloads. For full publisher identity verification, acquire a Windows Authenticode code-signing certificate and sign both TELER releases and the installer before public distribution.
