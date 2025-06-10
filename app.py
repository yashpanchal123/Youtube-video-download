from fastapi import FastAPI, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
import yt_dlp
from slugify import slugify
import subprocess
import sys
import json
from typing import Dict, List
import asyncio
from pathlib import Path
import urllib.parse
import tempfile
import shutil
import re
import zipfile
from datetime import datetime

app = FastAPI()

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (frontend)
app.mount("/static", StaticFiles(directory="static"), name="static")

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to be safe for HTTP headers"""
    # Remove or replace problematic characters
    filename = re.sub(r'[^\x00-\x7F]+', '', filename)  # Remove non-ASCII characters
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)  # Replace invalid filename characters
    return filename

def check_ffmpeg():
    """Check if FFmpeg is installed and accessible"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False

def cleanup_temp_dir(temp_dir: str):
    """Clean up temporary directory"""
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass

def download_video(url: str, format_type: str = "mp4", temp_dir: str = None) -> Dict:
    """
    Download a video or audio from YouTube URL and return the file path
    format_type: 'mp4' or 'mp3'
    temp_dir: Optional temporary directory to use
    """
    try:
        # Check if FFmpeg is installed
        if not check_ffmpeg():
            return {
                "status": "error",
                "message": "FFmpeg is not installed. Please install FFmpeg to use this application."
            }

        # Create a temporary directory for processing if not provided
        if temp_dir is None:
            temp_dir = tempfile.mkdtemp()
            should_cleanup = True
        else:
            should_cleanup = False

        try:
            if format_type == "mp3":
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '320',
                    }],
                    'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
                    'quiet': True,
                    'no_warnings': True,
                }
            else:  # mp4
                ydl_opts = {
                    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best',
                    'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
                    'quiet': True,
                    'no_warnings': True,
                    'merge_output_format': 'mp4',
                    'postprocessor_args': [
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                    ],
                }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                try:
                    info = ydl.extract_info(url, download=True)
                    if not info:
                        return {"status": "error", "message": "Failed to extract video information"}
                    
                    filename = ydl.prepare_filename(info)
                    
                    # Get the actual file path after processing
                    if format_type == "mp3":
                        filename = os.path.splitext(filename)[0] + '.mp3'
                    
                    if not os.path.exists(filename):
                        return {"status": "error", "message": "Downloaded file not found"}
                    
                    # Get the base filename without the path
                    base_filename = os.path.basename(filename)
                    safe_filename = sanitize_filename(base_filename)
                    
                    return {
                        "status": "success",
                        "title": info.get('title', 'Unknown'),
                        "filename": safe_filename,
                        "file_path": filename,
                        "temp_dir": temp_dir if should_cleanup else None,
                        "format": info.get('format', 'Unknown'),
                        "resolution": info.get('resolution', 'Unknown'),
                        "filesize": info.get('filesize', 0)
                    }
                except Exception as e:
                    print(f"Error in yt-dlp: {str(e)}")
                    return {"status": "error", "message": f"Error downloading video: {str(e)}"}
        except Exception as e:
            if should_cleanup:
                cleanup_temp_dir(temp_dir)
            raise e
    except Exception as e:
        return {"status": "error", "message": str(e)}

def create_zip_file(files: List[Dict], format_type: str) -> str:
    """Create a zip file containing all downloaded files"""
    # Create a temporary directory for the zip file
    zip_temp_dir = tempfile.mkdtemp()
    zip_filename = f"playlist_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    zip_path = os.path.join(zip_temp_dir, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in files:
                if file_info["status"] == "success":
                    # Add file to zip
                    zipf.write(
                        file_info["file_path"],
                        arcname=file_info["filename"]
                    )
        
        return zip_path
    except Exception as e:
        print(f"Error creating zip file: {str(e)}")
        cleanup_temp_dir(zip_temp_dir)
        raise e

@app.get("/")
def root():
    return FileResponse("index.html")

def get_channel_videos(channel_url: str):
    """Extract all video URLs from a channel"""
    try:
        ydl_opts = {
            'extract_flat': 'in_playlist',
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(channel_url, download=False)
            if 'entries' in result:
                # Filter out None entries and extract URLs
                videos = [entry for entry in result['entries'] if entry is not None]
                return [video['url'] for video in videos if 'url' in video]
            return []
    except Exception as e:
        print(f"Error getting channel videos: {e}")
        return []

@app.post("/download-video")
async def download_single_video(
    background_tasks: BackgroundTasks,
    video_url: str = Form(...),
    format_type: str = Form("mp4")
):
    """Download a single video"""
    if format_type not in ["mp4", "mp3"]:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid format type. Must be 'mp4' or 'mp3'"}
        )
    
    result = download_video(video_url, format_type)
    if result["status"] == "error":
        return JSONResponse(
            status_code=500,
            content={"error": result["message"]}
        )
    
    # Add cleanup task
    if result["temp_dir"]:
        background_tasks.add_task(cleanup_temp_dir, result["temp_dir"])
    
    # Stream the file directly to the browser
    return FileResponse(
        result["file_path"],
        media_type='application/octet-stream',
        filename=result["filename"],
        headers={
            'Content-Disposition': f'attachment; filename="{result["filename"]}"'
        }
    )

@app.post("/download-channel")
async def download_channel_videos(
    background_tasks: BackgroundTasks,
    channel_url: str = Form(...),
    format_type: str = Form("mp4")
):
    """Download all videos from a channel"""
    if format_type not in ["mp4", "mp3"]:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid format type. Must be 'mp4' or 'mp3'"}
        )
    
    # Get all video URLs from the channel
    video_urls = get_channel_videos(channel_url)
    if not video_urls:
        return JSONResponse(
            status_code=400,
            content={"error": "No videos found in the channel or invalid channel URL"}
        )
    
    # Download each video
    results = []
    for url in video_urls:
        result = download_video(url, format_type)
        if result["status"] == "success":
            # Add cleanup task
            if result["temp_dir"]:
                background_tasks.add_task(cleanup_temp_dir, result["temp_dir"])
            
            # Stream each file directly to the browser
            return FileResponse(
                result["file_path"],
                media_type='application/octet-stream',
                filename=result["filename"],
                headers={
                    'Content-Disposition': f'attachment; filename="{result["filename"]}"'
                }
            )
        results.append(result)
    
    return JSONResponse(
        status_code=500,
        content={"error": "Failed to download videos"}
    )

def get_playlist_videos(playlist_url: str):
    """Extract all video URLs from a playlist"""
    try:
        ydl_opts = {
            'extract_flat': 'in_playlist',
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(playlist_url, download=False)
            if 'entries' in result:
                # Filter out None entries and extract URLs
                videos = [entry for entry in result['entries'] if entry is not None]
                return [video['url'] for video in videos if 'url' in video]
            return []
    except Exception as e:
        print(f"Error getting playlist videos: {e}")
        return []

@app.post("/download-playlist")
async def download_playlist_videos(
    background_tasks: BackgroundTasks,
    playlist_url: str = Form(...),
    format_type: str = Form("mp4")
):
    """Download all videos from a playlist"""
    if format_type not in ["mp4", "mp3"]:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid format type. Must be 'mp4' or 'mp3'"}
        )
    
    try:
        # Get all video URLs from the playlist
        video_urls = get_playlist_videos(playlist_url)
        if not video_urls:
            return JSONResponse(
                status_code=400,
                content={"error": "No videos found in the playlist or invalid playlist URL"}
            )
        
        # Create a temporary directory for all downloads
        temp_dir = tempfile.mkdtemp()
        downloaded_files = []
        
        try:
            # Download each video
            for url in video_urls:
                result = download_video(url, format_type, temp_dir)
                if result["status"] == "success":
                    downloaded_files.append(result)
                else:
                    print(f"Failed to download video: {result.get('message', 'Unknown error')}")
            
            if not downloaded_files:
                return JSONResponse(
                    status_code=500,
                    content={"error": "Failed to download any videos from the playlist"}
                )
            
            # Create zip file with all downloaded videos
            zip_path = create_zip_file(downloaded_files, format_type)
            
            # Add cleanup task
            background_tasks.add_task(cleanup_temp_dir, temp_dir)
            background_tasks.add_task(cleanup_temp_dir, os.path.dirname(zip_path))
            
            # Return the zip file
            return FileResponse(
                zip_path,
                media_type='application/zip',
                filename=f"playlist_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip",
                headers={
                    'Content-Disposition': f'attachment; filename="playlist_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip"'
                }
            )
        except Exception as e:
            cleanup_temp_dir(temp_dir)
            raise e
            
    except Exception as e:
        print(f"Error processing playlist: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Error processing playlist: {str(e)}"}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
