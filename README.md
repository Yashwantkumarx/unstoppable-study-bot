# Study Leaderboard Bot (Railway Deployment)

This Discord bot automatically posts **daily, weekly, and monthly** study leaderboards for camera ON and OFF times.

### Features
- Auto post to different channels at scheduled times (IST)
- Slash command `/myhours` to check your own hours
- Easy to host on Railway

---

## Setup Instructions

1. **Fork this repo to your GitHub**
2. Go to [https://railway.app](https://railway.app) > New Project > Deploy from GitHub Repo
3. After deployment, add the following variables under **Environment Variables**:
   - `TOKEN` = Your Discord Bot Token
   - `CLIENT_ID` = Your Bot’s Application ID
   - `DAILY_CHANNEL_ID` = ID of #daily-leaderboard channel
   - `WEEKLY_CHANNEL_ID` = ID of #weekly-leaderboard channel
   - `MONTHLY_CHANNEL_ID` = ID of #monthly-leaderboard channel

4. Done! Your bot will now run 24x7 and post automatically.