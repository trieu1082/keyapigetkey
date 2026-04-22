import { Hono } from "hono"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import { Redis } from "@upstash/redis"

const app = new Hono()

app.use("*", cors())
app.use("*", secureHeaders())

const redis = new Redis({
url: process.env.UPSTASH_REDIS_REST_URL!,
token: process.env.UPSTASH_REDIS_REST_TOKEN!
})

const OWNER_KEY = process.env.OWNER_KEY!
const LINK4M_TOKEN = process.env.LINK4M_TOKEN!

const PENDING_TTL = 1800
const ACTIVE_TTL = 86400

const now=()=>Date.now()

const genKey=()=>{
const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
let o=""
for(let i=0;i<10;i++) o+=c[Math.floor(Math.random()*c.length)]
return o
}

const genId=()=>crypto.randomUUID().replace(/-/g,"").slice(0,12)

const log=async(data:any)=>{
await redis.lpush("logs",JSON.stringify(data))
await redis.ltrim("logs",0,50)
}

const createLink4m=async(url:string)=>{
try{
const r=await fetch(`https://link4m.co/api-shorten/v2?api=${LINK4M_TOKEN}&url=${encodeURIComponent(url)}`)
const j:any=await r.json()
if(j.status==="success") return j.shortenedUrl
}catch{}
return url
}

app.get("/",c=>c.text("ok"))

app.get("/key",async c=>{
let id=(c.req.query("id")||"").trim()
if(!id)return c.text("invalid")

let d:any=await redis.get(`keyid:${id}`)
if(!d)return c.html("<h2 style='color:red;text-align:center'>KEY EXPIRED</h2>")

return c.html(`
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GRAVITY KEY</title>

<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">

<style>
*{margin:0;padding:0;box-sizing:border-box}

body{
min-height:100vh;
display:flex;
justify-content:center;
align-items:center;
background:
linear-gradient(rgba(5,2,20,.9),rgba(10,5,30,.95)),
url("https://i.ibb.co/W4PmQDP1/your-image.png") no-repeat center center fixed;
background-size:cover;
font-family:'Press Start 2P',monospace;
color:#fff;
overflow:hidden
}

.wrap{
text-align:center;
padding:30px;
border-radius:25px;
background:rgba(15,8,30,.35);
backdrop-filter:blur(12px);
border:1px solid rgba(168,85,247,.3);
box-shadow:0 0 40px #a855f740, inset 0 0 30px #000;
animation:float 5s ease-in-out infinite alternate;
width:340px
}

@keyframes float{
to{transform:translateY(-10px)}
}

.title{
font-size:1.8rem;
background:linear-gradient(90deg,#ff00cc,#3333ff,#00ffff,#ff00cc);
background-size:300%;
-webkit-background-clip:text;
color:transparent;
animation:galaxy 4s linear infinite;
text-shadow:0 0 20px #a855f7;
margin-bottom:10px
}

@keyframes galaxy{
to{background-position:300%}
}

.sub{
font-size:.5rem;
opacity:.8;
margin-bottom:20px
}

.key{
font-size:.7rem;
letter-spacing:3px;
padding:12px;
border-radius:12px;
background:#05020c;
border:1px solid #2e1065;
box-shadow:inset 0 0 10px #000;
margin-bottom:15px;
word-break:break-all
}

.btn{
padding:10px;
width:100%;
border:none;
border-radius:12px;
background:linear-gradient(145deg,#6d28d9,#9333ea);
color:#fff;
font-family:inherit;
font-size:.6rem;
cursor:pointer;
box-shadow:0 5px 0 #3b0764,0 8px 20px rgba(168,85,247,.4);
transition:.1s
}

.btn:active{
transform:translateY(5px);
box-shadow:0 0 0 #3b0764
}

.ok{
margin-top:10px;
font-size:.5rem;
color:#22c55e;
display:none
}

.time{
margin-top:12px;
font-size:.5rem;
opacity:.7
}

.credit{
margin-top:20px;
font-size:.45rem;
opacity:.7;
line-height:1.6
}
</style>
</head>

<body>

<div class="wrap">

<div class="title">GRAVITY</div>
<div class="sub">KEY SYSTEM</div>

<div class="key" id="k">${d.key}</div>

<button class="btn" onclick="copy()">COPY KEY</button>

<div id="ok" class="ok">COPIED</div>

<div id="t" class="time">EXPIRE 30:00</div>

<div class="credit">
OWNER: TBOY<br>
DEV: PMT
</div>

</div>

<script>
function copy(){
let k=document.getElementById("k").innerText
navigator.clipboard.writeText(k)
document.getElementById("ok").style.display="block"
}

let sec=1800
setInterval(()=>{
sec--
let m=Math.floor(sec/60)
let s=sec%60
document.getElementById("t").innerText="EXPIRE "+m+":"+(s<10?"0"+s:s)
if(sec<=0){
document.body.innerHTML="<h2 style='color:red;text-align:center'>KEY EXPIRED</h2>"
}
},1000)
</script>

</body>
</html>
`)
})

app.get("/v1/getkey",async c=>{
let hwid=(c.req.query("hwid")||"").trim()
if(!hwid)return c.json({ok:false})

let R=redis

if(await R.get(`cd:${hwid}`))
return c.json({ok:false, msg:"slow down"})
await R.set(`cd:${hwid}`,1,{ex:5})

if(await R.get(`white:${hwid}`))
return c.json({ok:true,mode:"WHITELIST"})

let a:any=await R.get(`active:${hwid}`)
if(a?.exp>now())
return c.json({ok:true,mode:"ACTIVE"})

let p:any=await R.get(`pending:${hwid}`)
if(p)
return c.json({ok:true,mode:"PENDING",link:p.link})

// tạo mới
let key=genKey()
let id=genId()

let base=c.req.url.split("/v1")[0]
let raw=`${base}/key?id=${id}`

let short=await createLink4m(raw)

await R.set(`pending:${hwid}`,{key,id,link:short},{ex:PENDING_TTL})
await R.set(`keyid:${id}`,{key,hwid},{ex:PENDING_TTL})

await log({type:"create",hwid,key,id,time:now()})

return c.json({ok:true,mode:"NEW",link:short})
})

app.post("/v1/redeem",async c=>{
let b=await c.req.json().catch(()=>({}))
let hwid=(b.hwid||"").trim()
let key=(b.key||"").trim()
if(!hwid||!key)return c.json({ok:false})

let p:any=await redis.get(`pending:${hwid}`)
if(!p||p.key!==key)return c.json({ok:false})

let exp=now()+ACTIVE_TTL*1000

await redis.set(`active:${hwid}`,{exp},{ex:ACTIVE_TTL})
await redis.set(`white:${hwid}`,1,{ex:ACTIVE_TTL})
await redis.del(`pending:${hwid}`)

await log({type:"redeem",hwid,time:now()})

return c.json({ok:true,exp})
})

app.get("/v1/check",async c=>{
let hwid=(c.req.query("hwid")||"").trim()
if(!hwid)return c.json({ok:false})

if(await redis.get(`white:${hwid}`))
return c.json({ok:true})

let a:any=await redis.get(`active:${hwid}`)
if(!a)return c.json({ok:false})

return c.json({ok:a.exp>now()})
})

app.post("/create",async c=>{
if(c.req.header("x-owner-key")!==OWNER_KEY)
return c.text("no")

let key=genKey()
await log({type:"genkey",key,time:now()})
return c.text(key)
})

app.get("/logs",async c=>{
if(c.req.header("x-owner-key")!==OWNER_KEY)
return c.json({})

let l=await redis.lrange("logs",0,50)
return c.json(l.map((x:any)=>JSON.parse(x)))
})

app.get("/stats",async c=>{
if(c.req.header("x-owner-key")!==OWNER_KEY)
return c.json({})

let keys=await redis.keys("active:*")
return c.json({active:keys.length})
})

app.post("/whitelist",async c=>{
if(c.req.header("x-owner-key")!==OWNER_KEY)
return c.text("no")

let b=await c.req.json().catch(()=>({}))
let hwid=(b.hwid||"").trim()

await redis.set(`white:${hwid}`,1,{ex:ACTIVE_TTL})
return c.text("ok")
})

import { serve } from "@hono/node-server"

serve({
fetch: app.fetch,
port: Number(process.env.PORT) || 3000
})
