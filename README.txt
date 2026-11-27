ARORA ARCHITECTURAL STUDIOS – PROJECT MANAGEMENT SYSTEM (office server version)

SET UP THE SERVER PC (once)
1. Install Node.js "LTS" from https://nodejs.org (accept defaults).
2. Copy this whole folder to the server PC (e.g. C:\arora-pms).
3. Double-click install.bat (needs internet, about 1 minute).
4. Double-click start.bat. The window shows the addresses, e.g.
      Other PCs open:   http://192.168.1.20:3000
   Leave this window open. Every PC, phone or tablet on the office Wi-Fi/LAN
   opens that address in a browser (bookmark it).

FIRST LOGIN
   Username: admin   Password: admin123
   Change it immediately: Reports & Backup > Change admin password.
   The first run loads sample data (sample team logins: ananya, rohan, kavya,
   imran, all with password team123). When ready for real work:
   Reports & Backup > "Delete ALL data", then add your real team members
   (each gets their own username and password).

MAKE IT RELIABLE
 * Give the server PC a fixed IP (router DHCP reservation, or Windows network
   settings) so the address never changes.
 * Allow it through the firewall: Windows Defender Firewall > Advanced settings >
   Inbound Rules > New Rule > Port > TCP 3000 > Allow.
 * Start automatically at boot: press Win+R, type shell:startup, and put a
   shortcut to start.bat in that folder (or use Task Scheduler / PM2).
 * Keep the PC on during office hours and set it not to sleep.

ROLES
 Admin: everything (delete projects, manage team, backups, passwords).
 Team:  add/edit clients, projects and drawings, update statuses. Cannot delete
        projects, manage the team, or use backup/restore.

BACKUPS
 * Automatic: a full copy of the database is saved once a day in
   data\backups (last 30 days kept). Copy that folder to a USB drive or a
   cloud folder weekly.
 * Manual: Reports & Backup > Download backup file / Restore from file.
 * To recover: Restore from file, or stop the server and replace
   data\arora.db with a copy from data\backups.

OPTIONS (environment variables): PORT=3000, DATA_DIR=<folder>, ADMIN_PASSWORD=<first-run password>.
For access from outside the office, host this folder on a cloud server behind HTTPS
(do not expose port 3000 directly to the internet).
