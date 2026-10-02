// 어항멍 콘텐츠 데이터: 생물, 장식, 바닥, 배경, 도구, 업적, 이름

/* ---- 물고기 색 ---- */
const GOLD = {body:['#e8561c', '#ff8434', '#ffb867', '#ffe9c4'], fin:'255,128,56', pect:'255,170,110', tail:['rgba(255,112,40,.78)', 'rgba(255,164,100,.5)', 'rgba(255,222,190,.22)'], ray:'255,236,214', lid:'#f27a30', scale:'255,238,200', gill:'170,60,15', mouth:'255,196,160'};

/* ---- 생물 ----
   kind: fish(물고기 그리기) | critter(critters.js) | crawler(유리·바닥을 기어다님)
   size: 몸길이 배율, speed: 헤엄 속도 배율, depth: 'any' | 'deep'(바닥 근처를 좋아함), air: 수면으로 숨쉬러 감
   tail: twin(쌍꼬리) | fan(부채) | veil(드레스) | fork(갈래) | angel(가늘고 긴 갈래)
   bodyH: 몸 높이 배율, school: 무리 지어 다님, clean: 이끼를 먹어 줄이는 정도 */
export const SPECIES = {
  goldfish: {name:'금붕어', kind:'fish', price:300, size:1, speed:1, tail:'twin', bodyH:1, colors:[GOLD],
    desc:'동글동글 쌍꼬리 금붕어. 먹는 걸 제일 좋아합니다.'},
  blackmoor: {name:'블랙 금붕어', kind:'fish', price:450, size:1, speed:.9, tail:'twin', bodyH:1.02, eyeBig:1.25,
    colors:[{body:['#1c1a22', '#33303a', '#4d4852', '#77707a'], fin:'40,36,46', pect:'70,64,78', tail:['rgba(30,28,36,.85)', 'rgba(60,56,70,.55)', 'rgba(120,116,130,.25)'], ray:'170,164,180', lid:'#2c2932', scale:'150,146,160', gill:'10,8,14', mouth:'160,130,140'}],
    desc:'툭 튀어나온 큰 눈의 까만 금붕어. 느긋합니다.'},
  guppy: {name:'구피', kind:'fish', price:250, size:.62, speed:1.15, tail:'fan', bodyH:.74,
    colors:[
      {body:['#8a9aa8', '#b9c6cf', '#dbe3e8', '#f3f6f7'], fin:'255,140,60', pect:'230,230,235', tail:['rgba(255,120,40,.85)', 'rgba(70,120,255,.7)', 'rgba(255,220,90,.45)'], ray:'255,255,255', lid:'#9aa8b4', scale:'255,255,255', gill:'90,100,110', mouth:'230,190,190'},
      {body:['#6f8796', '#a6b8c4', '#d4dee4', '#f1f4f6'], fin:'60,190,255', pect:'230,230,235', tail:['rgba(40,170,255,.85)', 'rgba(150,80,255,.65)', 'rgba(255,120,200,.4)'], ray:'255,255,255', lid:'#8aa0ad', scale:'255,255,255', gill:'80,96,110', mouth:'230,190,190'},
      {body:['#9a8f7a', '#c8bea6', '#e6dfcc', '#f7f3ea'], fin:'255,70,90', pect:'235,230,225', tail:['rgba(255,60,80,.85)', 'rgba(255,170,60,.65)', 'rgba(255,240,200,.4)'], ray:'255,255,255', lid:'#a89c86', scale:'255,255,255', gill:'110,96,80', mouth:'230,180,180'}],
    desc:'작고 날쌘 물고기. 꼬리 색이 저마다 다릅니다.'},
  neon: {name:'네온테트라', kind:'fish', price:200, size:.46, speed:1.25, tail:'fork', bodyH:.6, school:true, pattern:'neon',
    colors:[{body:['#5a6f7e', '#8fa3b0', '#c9d4da', '#eef2f4'], fin:'220,235,240', pect:'230,240,245', tail:['rgba(210,225,235,.55)', 'rgba(220,235,240,.3)', 'rgba(230,240,245,.15)'], ray:'255,255,255', lid:'#7d909c', scale:'255,255,255', gill:'60,70,80', mouth:'210,190,190'}],
    desc:'파랗게 빛나는 줄무늬. 여럿이 모이면 함께 다닙니다.'},
  betta: {name:'베타', kind:'fish', price:600, size:.92, speed:.75, tail:'veil', bodyH:.78,
    colors:[
      {body:['#2a2f8c', '#3c4ab8', '#5a6fd8', '#9fb0f0'], fin:'70,90,220', pect:'130,150,240', tail:['rgba(60,70,210,.85)', 'rgba(150,90,230,.6)', 'rgba(220,120,220,.3)'], ray:'200,210,255', lid:'#3a46a8', scale:'190,205,255', gill:'20,24,80', mouth:'210,180,230'},
      {body:['#8c1c2a', '#b8283c', '#d84a5a', '#f09aa4'], fin:'220,40,60', pect:'240,120,130', tail:['rgba(210,30,50,.85)', 'rgba(240,80,60,.6)', 'rgba(255,170,120,.3)'], ray:'255,210,210', lid:'#a8283a', scale:'255,200,205', gill:'80,10,20', mouth:'240,170,170'},
      {body:['#5a2a8c', '#7a3cb8', '#a05ad8', '#d4a8f0'], fin:'150,70,220', pect:'190,140,240', tail:['rgba(130,50,210,.85)', 'rgba(220,90,200,.6)', 'rgba(255,170,230,.3)'], ray:'240,210,255', lid:'#7038a8', scale:'230,200,255', gill:'40,10,80', mouth:'230,180,230'}],
    desc:'드레스처럼 긴 지느러미. 혼자서도 당당합니다.'},
  angel: {name:'엔젤피시', kind:'fish', price:900, size:.9, speed:.8, tail:'angel', bodyH:1.5, pattern:'bars', tallFins:true,
    colors:[{body:['#b8b4a0', '#d8d4c2', '#ece9dc', '#f8f6ee'], fin:'200,196,176', pect:'230,226,210', tail:['rgba(200,196,178,.7)', 'rgba(220,216,200,.45)', 'rgba(240,236,224,.2)'], ray:'255,255,250', lid:'#c4bfa8', scale:'255,255,250', gill:'90,86,70', mouth:'220,190,180'}],
    desc:'세모난 몸에 긴 지느러미. 우아하게 떠다닙니다.'},
  shrimp: {name:'체리새우', kind:'crawler', price:180, size:.32, speed:.6, clean:.18, variants:3,
    desc:'유리에 붙은 이끼를 콕콕 먹어 줍니다.'},
  snail: {name:'달팽이', kind:'crawler', price:220, size:.34, speed:.25, clean:.22,
    desc:'느릿느릿 유리를 닦으며 지나갑니다.'},
  frog: {name:'물개구리', kind:'critter', price:700, size:.62, speed:.8, air:true, variants:3,
    desc:'물속에 사는 작은 개구리. 가끔 수면에 떠서 쉽니다.'},
  axolotl: {name:'우파루파', kind:'critter', price:1200, size:.85, speed:.55, depth:'deep', variants:3,
    desc:'웃는 얼굴의 도롱뇽. 바닥을 어슬렁거립니다.'},
  turtle: {name:'거북이', kind:'critter', price:1500, size:.8, speed:.6, air:true, variants:3,
    desc:'느긋한 거북이. 숨 쉬러 수면에 올라갑니다.'}
};
export const SPECIES_ORDER = ['goldfish', 'guppy', 'neon', 'blackmoor', 'betta', 'angel', 'shrimp', 'snail', 'frog', 'axolotl', 'turtle'];

/* ---- 장식 (어항 바닥에 놓음) ---- */
export const DECOR = {
  vallis:    {name:'긴 수초', price:150},
  cabomba:   {name:'붕어마름', price:200},
  anubias:   {name:'아누비아스', price:250},
  marimo:    {name:'마리모', price:120, rolls:true},
  stones:    {name:'강돌', price:100},
  driftwood: {name:'유목', price:400},
  cave:      {name:'도자기 동굴', price:350},
  shell:     {name:'진주 조개', price:300}
};
export const DECOR_ORDER = ['vallis', 'cabomba', 'anubias', 'marimo', 'stones', 'driftwood', 'cave', 'shell'];

export const FLOORS = {
  none:   {name:'없음', price:0},
  sand:   {name:'흰 모래', price:0},
  gravel: {name:'자갈', price:300},
  soil:   {name:'수초 흙', price:300}
};
export const FLOOR_ORDER = ['none', 'sand', 'gravel', 'soil'];

/* ---- 창밖 배경 ---- */
export const BACKGROUNDS = {
  city:   {name:'도시의 창', price:0, desc:'저녁이면 창밖에 불빛이 번집니다.'},
  forest: {name:'숲속 창가', price:800, desc:'낮엔 나뭇잎 빛, 밤엔 반딧불이.'},
  sea:    {name:'바닷가 창', price:1000, desc:'수평선과 달빛이 보이는 창.'},
  cafe:   {name:'작은 카페', price:800, desc:'따뜻한 전구가 걸린 카페 선반.'},
  space:  {name:'우주 정거장', price:1500, desc:'창밖으로 행성과 별이 흐릅니다.'}
};
export const BG_ORDER = ['city', 'forest', 'sea', 'cafe', 'space'];

/* ---- 도구 ---- */
export const ITEMS = {
  feeder:  {name:'자동 먹이통', price:2000, desc:'배가 고파지면 알아서 먹이를 줍니다. 포만도가 절반 아래로 내려가지 않습니다.'},
  cleaner: {name:'이끼 청소기', price:2500, desc:'유리에 이끼가 끼는 속도를 절반으로 줄입니다.'},
  tank2:   {name:'두 번째 어항', price:3000, desc:'어항을 하나 더 둡니다. 어항마다 생물과 꾸밈이 따로입니다.'},
  tank3:   {name:'세 번째 어항', price:6000, desc:'어항을 하나 더 둡니다.', needs:'tank2'}
};
export const ITEM_ORDER = ['feeder', 'cleaner', 'tank2', 'tank3'];

/* ---- 보상 ---- */
export const REWARD = {welcome:300, visit:30, streak7:150, clean:100, feed:60, pet:2};

/* ---- 업적 ---- */
export const ACHIEVEMENTS = [
  ...[[3, 100], [7, 200], [14, 300], [30, 500], [50, 700], [100, 1000], [200, 1500], [365, 3000], [500, 4000], [1000, 10000]]
    .map(([n, r]) => ({id:'day' + n, name:`함께한 지 ${n}일`, stat:'days', goal:n, reward:r})),
  ...[[10, 100], [100, 500], [1000, 2000]].map(([n, r]) => ({id:'feed' + n, name:`먹이 ${n}알 먹이기`, stat:'eaten', goal:n, reward:r})),
  ...[[7, 200], [30, 600], [100, 1500]].map(([n, r]) => ({id:'clean' + n, name:`유리 ${n}번 닦기`, stat:'cleans', goal:n, reward:r})),
  ...[[3, 200], [6, 500], [11, 2000]].map(([n, r]) => ({id:'dex' + n, name:`생물 ${n}종 만나기`, stat:'dex', goal:n, reward:r})),
  ...[[1, 300], [10, 1000]].map(([n, r]) => ({id:'baby' + n, name:`새끼 ${n}마리 태어나기`, stat:'babies', goal:n, reward:r})),
  {id:'decor5', name:'장식 5개 놓기', stat:'decor', goal:5, reward:200},
  {id:'tank2', name:'어항 두 개 갖기', stat:'tanks', goal:2, reward:500}
];

/* ---- 이름 ---- */
export const NAMES = ['방울', '콩이', '몽실', '보리', '두부', '꼬물', '찰랑', '별이', '구름', '모찌', '호두', '단추', '밤톨', '쿠키', '라떼', '토리', '나리', '하루', '솜이', '뭉치', '자두', '앵두', '깨비', '초코', '감자', '도토리', '봄이', '여름', '가을', '겨울'];
export const FIRST_NAME = '뽀글이';

/* ---- 한도 ---- */
export const LIMITS = {creatures:12, decor:12, tanks:3};
