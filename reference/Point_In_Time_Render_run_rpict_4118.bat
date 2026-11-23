@echo off
REM Radiance rpict batch for hour 4118, quality 4
REM Root folder: "C:\kybele_UW_Greenhouse_April04\point_in_time_render"
REM Sky file: "sky_4118.rad"
REM Envelope files: envelope.mat, envelope.rad
REM Luminaires file: "luminaries.rad"

cd /d "C:\kybele_UW_Greenhouse_April04\point_in_time_render"

REM 0) Build octree with sky (and luminaires) for this hour
oconv "envelope.mat" "envelope.rad" "sky_4118.rad" "luminaries.rad" > "model_4118.oct"

REM 1) Low-res warm-up to populate ambient cache (quality 4)
rpict -t 10 -vth -vp 7.9808 -0.0192 3.9359 -vd -0.9958 -0.0013 -0.0913 -vu 0.0000 0.0000 1.0000 -vh 180.000 -vv 180.000 -x 64 -y 64 -af IMG.amb -ps 4 -pt 0.15 -pj 0.8 -dj 0.6 -ds 0.25 -dt 0.4 -dc 0.6 -dr 2 -dp 256 -st 0.25 -ab 3 -ad 256 -as 64  -ar 80  -aa 0.18 -lr 5 -lw 0.002 -av 0 0 0 "model_4118.oct" > IMG_4118_preview.unf
del IMG_4118_preview.unf

REM 2) High-res main render (quality 4)
rpict -t 10 -vth -vp 7.9808 -0.0192 3.9359 -vd -0.9958 -0.0013 -0.0913 -vu 0.0000 0.0000 1.0000 -vh 180.000 -vv 180.000 -x 3840 -y 3840 -af IMG.amb -ps 3 -pt 0.12 -pj 0.85 -dj 0.6 -ds 0.20 -ab 3 -ad 512 -as 128 -ar 128 -aa 0.14 -lr 6 -lw 0.0015 -av 0 0 0 -e error_4118.log "model_4118.oct" > IMG_4118_0.unf

REM 3) Convert to HDR, filter and downsample to final resolution
pcompos -a 1 IMG_4118_0.unf > temp_4118.hdr
pfilt -r 0.6 -x /2 -y /2 temp_4118.hdr | getinfo -a "VIEW= -vth -vp 7.9808 -0.0192 3.9359 -vd -0.9958 -0.0013 -0.0913 -vu 0.0000 0.0000 1.0000 -vh 180.000 -vv 180.000 -x 1920 -y 1920" > Luminance_4118.hdr
del temp_4118.hdr
del IMG_4118_0.unf

echo Done. Output: Luminance_4118.hdr
