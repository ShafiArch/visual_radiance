echo Annual RUN (part 0)
epw2wea USA_WA_Seattle-Tacoma.Intl.AP.727930_TMYx.2004-2018.epw Weather_0.wea
gendaymtx -m 1 Weather_0.wea > Weather_0.smx
oconv envelope.mat envelope.rad > amodel_0.oct
rfluxmtx -I+ -y 429 -lw 0.001 -ab 3 -ad 2048 -n 4 - skyglow.rad -i amodel_0.oct < 0_part0.pts > illum_part0.mtx
dctimestep illum_part0.mtx Weather_0.smx | rmtxop -fa -t -c 47.4 119.9 11.6 - > annualR_part0.ill
oconv envelope.blk envelope.rad > bmodel_0.oct
rfluxmtx -I+ -y 429 -lw 0.001 -ab 3 -ad 2048 -n 4 - skyglow.rad -i bmodel_0.oct < 0_part0.pts > billum_part0.mtx
gendaymtx -m 1 -d Weather_0.wea > Weatherd_0.smx
dctimestep billum_part0.mtx Weatherd_0.smx | rmtxop -fa -t -c 47.4 119.9 11.6 - > annualRd_part0.ill
echo void light solar 0 0 3 1e6 1e6 1e6 > suns_0.rad
cnt 5221 | rcalc -e MF:6 -f reinsrc.cal -e Rbin=recno -o "solar source sun 0 0 4 ${Dx} ${Dy} ${Dz} 0.533" >> suns_0.rad
oconv -f envelope.blk envelope.rad suns_0.rad > sunCoefficientsDDS_0.oct
rcontrib -I+ -ab 0 -y 429 -n 4 -ad 64 -lw 0.001 -dc 1 -dt 0 -dj 0 -fa -e MF:6 -f reinhart.cal -b rbin -bn Nrbins -m solar sunCoefficientsDDS_0.oct < 0_part0.pts > cdsDDS_part0.mtx
gendaymtx -5 0.533 -d -m 6 Weather_0.wea > WeathersunM6_0.smx
dctimestep cdsDDS_part0.mtx WeathersunM6_0.smx | rmtxop -fa -t -c 47.4 119.9 11.6 - > annualRs_part0.ill
rmtxop annualR_part0.ill + -s -1 annualRd_part0.ill + annualRs_part0.ill > annualRfinal_part0.ill
echo Done part 0
