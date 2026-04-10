🌌 NutriSense — An AI Health Hub
NutriSense is a next-generation, data-driven wellness platform designed to bridge the gap between nutritional data and actionable habits. Built with a professional "Digital Hub" philosophy, it transforms the traditional tracking experience into a frictionless, "Anti-Gravity" environment where your health strategy is always in orbit.

Deploved via Google Cloud Run for 100% scalability and low-latency performance.

✨ Core Pillars
Swiggy-Inspired UX: A "one-tap" mobile-first interface designed for rapid meal logging and instant feedback.

Anti-Gravity UI: A futuristic design language utilizing Glassmorphism, depth-of-field effects, and floating CSS animations to provide a weightless, immersive feel.

NoSQL Real-Time Sync: Leverages a serverless NoSQL (Firestore/Firebase) backend to ensure that "Efficiency Scores" and meal logs update across the hub instantly.

Active Meal Strategy: An intelligent logic layer that audits macro-nutrient gaps and suggests "Smart Swaps" in real-time.

🛠️ Technical Stack
Frontend: HTML5, CSS3 (Custom Keyframe Physics), JavaScript (ES6+).

Backend-as-a-Service: NoSQL Firestore for high-speed document storage and real-time listeners.

Authentication: Swiggy-style Phone OTP / Magic Link authentication for a secure, frictionless entry.

Cloud Infrastructure: Containerized and deployed via Google Cloud Run to ensure professional-grade reliability.

CI/CD: Automated deployment pipeline via GitHub Actions.

📊 Key Features
1. The "Today" Orbit (Contextual Intelligence)
The hub reads the time of day and your current nutritional gaps to deliver proactive nudges. It knows your patterns and shows exactly what is needed to hit your targets right now.

2. Behavioral Audit (Health Report)
By analyzing longitudinal NoSQL data, the system identifies habit loops—linking meal timing to energy levels and identifying consistent nutritional shortfalls.

3. Smart Swaps (Meals Tab)
Every meal is assigned a health score (0–100). The system suggests swaps based on what you actually eat, rather than generic, "ideal-world" substitutes.

📂 Project Structure
Plaintext
├── public/                 # Assets and floating UI elements
├── src/
│   ├── components/         # Glassmorphism & Anti-Gravity Cards
│   ├── services/           # NoSQL (Firebase/Firestore) Logic
│   └── styles/             # Global CSS Variables & Animations
├── firebase.rules          # NoSQL Security Protocols
└── README.md               # Project Documentation
🔒 Security & Privacy
NutriSense follows a "Privacy-First" approach. All health data is encrypted at rest within the NoSQL database and is only accessible via verified user sessions.
