# WhatsWay — Local Setup Guide (0 se shuru)

Ye guide bilkul shuru se hai — pehle PostgreSQL install/download karna, fir project set up karke server-client dono ek saath chalana.

---

## Step 1: Node.js install karo (agar pehle se nahi hai)

1. https://nodejs.org par jao
2. **LTS version** download karo (v20 ya usse upar)
3. Installer chala do — sab default options rakhna
4. Check karne ke liye terminal/cmd me likho:
   ```
   node -v
   npm -v
   ```
   Dono ka version dikhna chahiye.

---

## Step 2: PostgreSQL download aur install karo (0 se)

### Windows par

1. https://www.postgresql.org/download/windows/ par jao
2. "Download the installer" par click karo (ye EnterpriseDB ka installer hai)
3. Latest version (16 ya 17) download karo
4. `.exe` file chalao, installer me:
   - Installation directory — default rehne do
   - Components — sab select rehne do (PostgreSQL Server, pgAdmin 4, Command Line Tools)
   - **Password maango ga superuser `postgres` ke liye** — koi simple password set karo aur **yaad rakho** (e.g. `postgres123`)
   - Port — default `5432` rehne do
   - Locale — default rehne do
5. Install ho jaane do. Installer ke end me "Stack Builder" pooche ga — skip kar sakte ho
6. Install ke baad, Start Menu me **pgAdmin 4** aayega — ye Postgres ka GUI tool hai

### Mac par

1. https://www.postgresql.org/download/macosx/ par jao
2. "Postgres.app" download karo (sabse aasan tareeka) — https://postgresapp.com/
3. Postgres.app ko Applications folder me daal ke open karo
4. "Initialize" button dabao — ek default server start ho jayega on port 5432
5. Terminal me PATH add karo (Postgres.app site par instructions hain) taaki `psql` command chale

   Ya phir Homebrew se:
   ```
   brew install postgresql@16
   brew services start postgresql@16
   ```

### Linux (Ubuntu/Debian) par

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Check karo install hua ya nahi:
```bash
psql --version
```

---

## Step 3: Database banao

Terminal/cmd kholo (Windows par "SQL Shell (psql)" bhi Start Menu me milega — wahi use kar sakte ho).

```bash
psql -U postgres
```
(Windows par ye maango ga wahi password jo Step 2 me set kiya tha)

Ab psql ke andar ye commands ek-ek karke chalao:

```sql
CREATE DATABASE whatsway;
CREATE USER whatsway_user WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE whatsway TO whatsway_user;
\c whatsway
GRANT ALL ON SCHEMA public TO whatsway_user;
\q
```

> `yourpassword` ki jagah apna khud ka password daalo — isi ko `.env` file me use karenge.

**pgAdmin se bhi bana sakte ho (GUI se, agar CLI pasand nahi):**
1. pgAdmin 4 kholo → left side "Servers" → "PostgreSQL" par click, password daalo
2. "Databases" par right-click → Create → Database → naam do `whatsway` → Save
3. "Login/Group Roles" par right-click → Create → Role → naam `whatsway_user`, "Definition" tab me password set karo, "Privileges" tab me sab "Yes" kar do

---

## Step 4: Project ready karo

Zip extract karo, terminal me us folder me jao:

```bash
cd whatsway
npm install
```

Ye server aur client dono ke dependencies install karega (ek hi `package.json` hai).

---

## Step 5: `.env` file banao

Project folder me `.env.example` file hai — usi ki copy banao:

```bash
cp .env.example .env
```
(Windows cmd me: `copy .env.example .env`)

Ab `.env` file ko kisi editor (Notepad, VS Code) me kholo aur ye values set karo:

```
DATABASE_URL=postgresql://whatsway_user:yourpassword@localhost:5432/whatsway
SESSION_SECRET=koi_bhi_lamba_random_string_daal_do
PORT=5000
APP_URL=http://localhost:5000
NODE_ENV=development
```

Baaki cheezein (WhatsApp API, Stripe, Razorpay, OpenAI, SMTP, Redis) **abhi ke liye blank chhod sakte ho** — app chal jayegi, bas wo specific features (WhatsApp bhejna, payment, email) tab tak kaam nahi karenge jab tak keys na daalo.

---

## Step 6: Database tables banao

```bash
npm run db:push
```

Ye Drizzle ORM se `shared/schema.ts` ke hisaab se saari tables `whatsway` database me bana dega. Agar koi confirmation prompt aaye (fresh DB par), "Yes"/accept kar dena — nayi database hai, kuch data lose nahi hoga.

---

## Step 7: Starting data daalo (admin user waghera)

```bash
npm run seed
```

Ye default admin account, plans, aur baaki zaroori starting data bana dega. Console output me dhyan se dekho — admin ka login email/password wahin print hoga.

---

## Step 8: Server + Client dono ek saath chalao

```bash
npm run dev
```

Ye ek hi command se:
- Express server start hota hai (backend/API)
- Vite ke through React client bhi usi server ke andar serve hota hai (frontend)

Browser me kholo:
```
http://localhost:5000
```

Bas — app chal jayegi. Alag se client/server run karne ki zaroorat nahi hai, ye ek combined app hai.

---

## Roz-roz chalane ke liye (baad me)

Ek baar setup ho jaane ke baad, agli baar bas ye 2 cheezein chahiye:
1. PostgreSQL service chal rahi ho (Windows/Mac me generally auto-start hoti hai; Linux me `sudo systemctl start postgresql`)
2. Project folder me:
   ```bash
   npm run dev
   ```

---

## Production build (baad me, jab live server par daalna ho)

```bash
npm run build
npm start
```

`NODE_ENV=production` set hona chahiye `.env` me production ke liye.

---

## Common problems

| Problem | Solution |
|---|---|
| `DATABASE_URL` error / "ensure database is provisioned" | `.env` file check karo, `DATABASE_URL` sahi se likha hai ya nahi |
| `psql: command not found` | PostgreSQL install nahi hua ya PATH me nahi hai — reinstall karo, ya Postgres bin folder PATH me add karo |
| Port 5000 already in use | `.env` me `PORT` change kar do (e.g. `PORT=5001`) |
| `password authentication failed` | `.env` ka password aur Step 3 me banaya gaya password match karo |
| `npm install` me error | Node.js version check karo (v20+ chahiye), `node -v` se |
