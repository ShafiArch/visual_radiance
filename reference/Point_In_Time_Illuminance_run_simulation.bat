echo Running Radiance Simulation
oconv model\scene\envelope.mat model\scene\envelope.rad sky.rad > model.oct
rtrace -I -h -ab 3 -ad 1024 -aa 0.10 -ar 64  -lr 6 -lw 1e-4 model.oct < model\grid\0.pts > raw.txt
echo Done!
