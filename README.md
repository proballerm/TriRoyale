# TriRoyale 🎮  

A real-time **Trivia Battle Royale** game built with **Next.js**, **Express**, **Socket.IO**, and **MongoDB**. Players compete in elimination rounds until one winner remains.  

**Play Now:** [TriRoyale Live on Render](https://triroyale.onrender.com)  

---

## 🎯 Features  
- ⚡ Real-time multiplayer gameplay with Socket.IO  
- 🎲 Battle Royale format: wrong answers = elimination  
- 📚 Multiple trivia categories: Sports, Science, Movies, History, Geography, Music, or “All”  
- 🤖 Trivia bots for testing and balance  
- 💾 MongoDB-backed question bank with cooldowns to prevent repeats  
- 📊 Real-time leaderboards  
- 🔐 Secure login (email/password with JWT + Google OAuth2)  
- 🌐 Web-first, with mobile app (React Native + Expo) in progress  

---

## 🕹️ How to Play  
1. Go to [triroyale.onrender.com](https://triroyale.onrender.com)  
2. Log in or play as guest  
3. Join a lobby and choose a category  
4. Answer before the timer ends  
5. Wrong answers eliminate you — last player standing wins!  

---

## 🛠️ For Developers  

TriRoyale is currently configured to run on a **deployed server environment** (e.g., Render).  

If you fork this repository and want to run it locally, you’ll need to:  
- Adjust **API routes** and **socket server URLs** for `localhost`.  
- Set up your own MongoDB instance.  
- Configure environment variables (`.env`) for authentication and database connections.  

> ⚠️ By default, this repository is ready for **server deployment**, not local play.  

---

## 📊 Roadmap  
- ✅ Multiplayer trivia on web  
- ✅ MongoDB persistence for question bank  
- ✅ Trivia bots support  
- 🔄 Mobile app (React Native + Expo)  
- 🔄 Advanced leaderboards with player stats  
- 🔄 Game replays & highlights  

---

## 🤝 Contributing  
Pull requests are welcome! Fork the repository, make your changes, and submit a PR with a clear description.  

---

## 📜 License  
MIT License © 2025 Prabal Malavalli  
