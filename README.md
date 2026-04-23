# 🌌 Futuristic Holiday Reservation Platform

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

> **⚠️ Project Status: In Active Development (WIP)**
> A high-performance, full-stack reservation system built with a futuristic UI and a robust PostgreSQL-backed architecture. Designed for seamless city-hotel discovery across Turkey.

## Table of Contents

- [Vision & Overview](#vision-overview)
- [Tech Stack & Architecture](#tech-stack-architecture)
- [Project Structure](#project-structure)
- [Page Map](#page-map)
- [Getting Started](#getting-started)
- [Screenshots](#screenshots)
- [Future Roadmap](#future-roadmap)
- [License](#license)

---

<a id="vision-overview"></a>
## 🛰️ Vision & Overview

**Futuristic Holiday Reservation** is a next-generation platform that bridges immersive web design and reliable data management. It provides a focused environment for users to discover, compare, and manage travel reservations with speed and precision.

### 🌌 Key Capabilities

| Area | Features |
| --- | --- |
| **Discovery Engine** | Multi-category search (Hotels, Tours, Flights, Villas) with smart city-based routing. |
| **Advanced Filtering** | Real-time results filtered by price, concept, rating, and amenities with integrated map views. |
| **Interactive UX** | Comparison tools, favorites management, and hotel detail modals with dynamic pricing. |
| **Booking Wizard** | Multi-step reservation flow with live status tracking and edit/cancel capabilities. |
| **Identity Hub** | Secure login/registration flows, personalized dashboards, and coupon management. |

---

<a id="tech-stack-architecture"></a>
## 🛠️ Tech Stack & Architecture

### Core Backend & Data Integrity

- **Node.js & Express:** Scalable RESTful API architecture managing business logic.
- **PostgreSQL:** The source of truth for structured and secure storage of users, hotels, and reservations.
- **Security:** Content Security Policy (CSP) aware frontend behavior and server-side data handling.

### Frontend & User Experience

- **Vanilla JS (ES6+):** Framework-free implementation optimized for speed and control.
- **Immersive CSS:** Custom styling system with responsive layouts and modern interaction patterns.
- **Hybrid Storage:** PostgreSQL is used for persistent data, while `localStorage` supports temporary UI state (for example theme preference).

---

<a id="project-structure"></a>
## 📂 Project Structure

```text
holiday-rezervation/
|-- backend/                # Server-side environment
|   |-- package.json        # Dependencies (Express, pg, etc.)
|   |-- db.js               # PostgreSQL connection pool
|   `-- server.js           # API endpoints and middleware
|-- frontend/               # Client-side environment
|   |-- assets/             # Static frontend assets
|   |   |-- css/            # Stylesheet files
|   |   |   |-- aboutme.css       # About page styles
|   |   |   |-- experience.css    # Experience UI styles
|   |   |   `-- styles.css        # Global/base styles
|   |   `-- js/             # Frontend JavaScript modules
|   |       |-- app.js            # Main application logic
|   |       |-- cities.js         # City listing helpers
|   |       |-- experience.js     # Interactive experience logic
|   |       |-- hotels.js         # Hotel rendering and behavior
|   |       |-- login.js          # Login flow logic
|   |       `-- title.js          # Dynamic page title logic
|   |-- img/
|   |-- aboutme.html        # About page
|   |-- city.html           # City results page
|   |-- index.html          # Landing page
|   |-- login.html          # Authentication page
|   `-- reservations.html   # Reservation management page
|-- .gitignore
`-- README.md
```

<a id="page-map"></a>
## 🧭 Page Map

<!-- markdownlint-disable MD033 -->
<details open>
	<summary><strong>Home Page - index.html</strong></summary>

- Hero slider, campaign highlights, and campaign center.
- Tabbed product search with smart routing.
- Recently viewed items, personalized suggestions, and contact form.

</details>

<details>
	<summary><strong>City Results - city.html</strong></summary>

- Advanced filtering and sorting panel.
- Hotel cards with favorites and comparison flows.
- Map view, reviews, and recently viewed items.

</details>

<details>
	<summary><strong>Reservation Management - reservations.html</strong></summary>

- Confirmed / Upcoming / Past / Cancelled / All tabs.
- Summary cards, detail-edit modal, and bulk cleanup actions.

</details>

<details>
	<summary><strong>Identity & Profile Flows - login.html</strong></summary>

- Login and account access flows.
- Profile overview, coupons, and saved searches experience.

</details>
<!-- markdownlint-enable MD033 -->

<a id="getting-started"></a>
## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/umutsadebal1/holiday-rezervation.git
cd holiday-rezervation
```

### 2. Launch the Frontend

```bash
npx http-server ./frontend
```

### 3. Launch the Backend

```bash
cd backend
npm install
npm run dev
```

PostgreSQL must be running and backend environment variables should be configured securely in your local or deployment environment.

---

<a id="screenshots"></a>
## 🖼️ Screenshots

### 1. Home Page

![Home Page Preview](https://i.hizliresim.com/huaezo2.png)

### 2. City Results and Filtering

![City Results and Filtering Preview](https://i.hizliresim.com/9ua5i1t.png)

### 3. Reservation Flow

![Reservation Flow Preview](https://i.hizliresim.com/qwbq0sc.png)

---

<a id="future-roadmap"></a>
## 🗺️ Future Roadmap

- [ ] Integration of global travel APIs for live data.
- [ ] AI-powered personalized trip recommendations.
- [ ] Advanced user authentication (OAuth/JWT).
- [ ] Expanded database schema for real-time notifications.

<a id="license"></a>
## 📜 License

Developed with futuristic passion by Umut Sadebal.

This project is built for portfolio and educational excellence.
