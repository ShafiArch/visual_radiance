echo Running Radiance Simulation
oconv envelope.mat envelope.rad luminaries.rad > model.oct
rtrace -I -h -ab 1 -ad 512  -as 64  -aa 0.18 -ar 48  -lr 4  -lw 3e-4 -ds 0   -dj 0   -dt 0.15 -st 0.20 -n 16 -af amb.cache -aw 0 model.oct < 0.pts > raw.txt
echo Done!
