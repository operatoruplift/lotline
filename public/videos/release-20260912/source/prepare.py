"""Prepare actual recorded UI chapters; run in the Higgsfield media sandbox."""

import json
import os
from pathlib import Path
import subprocess

workspace = Path(os.environ.get("LOTLINE_VIDEO_WORKSPACE", "/home/user/work/lotline"))
board = json.loads((workspace / "storyboard.json").read_text())
(workspace / "prepared").mkdir(parents=True, exist_ok=True)

for name, film in board.items():
    for index, chapter in enumerate(film["chapters"]):
        duration = chapter["until"] - chapter["at"]
        subprocess.run([
            "ffmpeg", "-v", "error", "-ss", str(chapter["from"]),
            "-i", str(workspace / "raw" / (chapter["clip"] + ".webm")),
            "-vf", f"tpad=stop_mode=clone:stop_duration={duration}",
            "-t", str(duration), "-an", "-c:v", "libx264", "-preset", "fast",
            "-crf", "22", "-r", "30", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-threads", "2", "-y",
            str(workspace / "prepared" / f"{name}-{index}.mp4"),
        ], check=True)

subprocess.run([
    "convert", "-background", "none", str(workspace / "logo.svg"),
    "-resize", "128x128", str(workspace / "logo.png"),
], check=True)
