<<<<<<< HEAD
<<<<<<< HEAD
# YouTube Video Downloader

A web application that allows users to download YouTube videos and playlists in MP4 or MP3 format.

## Features

- Download single videos in MP4 or MP3 format
- Download entire playlists
- Download channel videos
- Direct download to your computer
- Progress tracking
- Clean and modern UI

## Deployment Instructions

### Deploying to Render.com (Free)

1. Create a GitHub repository and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. Go to [Render.com](https://render.com) and sign up/login

3. Click "New +" and select "Web Service"

4. Connect your GitHub repository

5. Configure the deployment:
   - Name: youtube-downloader (or your preferred name)
   - Environment: Docker
   - Branch: main
   - Plan: Free

6. Click "Create Web Service"

The application will be deployed and you'll get a URL like `https://youtube-downloader.onrender.com`

### Local Development

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Install FFmpeg:
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - Linux: `sudo apt-get install ffmpeg`
   - macOS: `brew install ffmpeg`

3. Run the application:
   ```bash
   uvicorn app:app --reload
   ```

4. Open http://localhost:8000 in your browser

## Requirements

- Python 3.8+
- FFmpeg
- FastAPI
- yt-dlp
- Other dependencies listed in requirements.txt

## License

MIT License 
=======
# Youtube-video-download
>>>>>>> a16203676723f50e7909e1bf9477226ce5e3b983
=======
# Youtube-video-download
>>>>>>> a16203676723f50e7909e1bf9477226ce5e3b983
