
Since Electron uses Chromium it has great video codec support, so videos should generally be encoded in AV1 so that overall package size is kept to a minimum.

```
#!/bin/bash
for filename in ./*.mp4; do
    ffmpeg -y -i "$filename" -c:v libaom-av1 -crf 30 -b:v 0  "${filename%.*}.webm"
done
```
