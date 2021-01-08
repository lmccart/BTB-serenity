Repo Notes:
* Serenity prompts are located in `data/prompts.tsv` and in this [google spreadsheet](https://docs.google.com/spreadsheets/d/12XJfovHsBwuTXDcOGfeTrTolDyWDBs5Kzc2h6HXEZHE/edit#gid=0)

Relevant URLS:
* https://beyondthebreakdown.com - homepage
* https://beyondthebreakdown.com/register - registration pages
* https://beyondthebreakdown.com/session?roomId=BTB-1234 - session, participant view
* https://beyondthebreakdown.com/session?roomId=BTB-1234&guide=true - session, facilitator view

HTTPS Functions:
* https://us-central1-beyond-the-breakdown.cloudfunctions.net/refresh
* https://us-central1-beyond-the-breakdown.cloudfunctions.net/checkReminder?code=check
* https://us-central1-beyond-the-breakdown.cloudfunctions.net/checkOneYear?code=check

Quick Reference Links:
* https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe
* https://console.firebase.google.com/u/0/project/btb-jitsi/authentication/users
* https://uptimerobot.com/dashboard#mainDashboard - cron tasks (refresh sessions)
