### TeamSudoku Game Platform 🎮

This is a versatile, browser-based gaming platform that supports a variety of classic games for both **solo** and **real-time multiplayer** action. The entire application is a Progressive Web App (PWA) built to run without a central server, using WebRTC to establish direct peer-to-peer connections between players.

---

### Core Features

*   **Multiple Games:** Play Sudoku, Connect 4, Word Search, Spelling Bee, Memory Match, and Black Jack.
*   **Real-time Multiplayer:** Connect with friends for cooperative or competitive gameplay.
*   **Serverless Architecture:** Uses WebRTC for direct peer-to-peer data channels, eliminating the need for a game server.
*   **Flexible Connection Methods:**
    *   **PeerJS (Recommended):** Connect easily using a simple Host ID.
    *   **QR Code:** A unique signaling method that chunks connection data into QR codes.
    *   **Manual:** A fallback for copy-pasting connection data.
*   **Solo & AI Play:** Play games by yourself, or challenge a simple AI opponent in Connect 4.
*   **Team System:** In multiplayer, hosts can create multiple teams, and players can join them to compete.
*   **PWA & Offline Support:** As a Progressive Web App, it can be "installed" on your device and works offline.
*   **Customizable Themes:** Switch between multiple visual themes to customize your experience.

---

### How to Play

#### Solo Play

Playing by yourself is simple:
1.  Open the application.
2.  Use the "Game" dropdown to select a game (e.g., Black Jack, Connect 4).
3.  Configure any game-specific options (like difficulty or number of decks).
4.  Click "New Game" (or "Deal" in Black Jack) to start playing!

#### Multiplayer

You will need a simple local web server to run `index.html` due to browser security restrictions for WebRTC.

1.  **Player 1 (Host):**
    *   Open the app and click the "P2P Config" button.
    *   Ensure your role is "Player 1 (Host)".
    *   Select a "Connection Method". **PeerJS** is the easiest.
    *   Your unique **Host ID** will be displayed. Share this ID with other players.
    *   Wait for players to connect.

2.  **Player 2+ (Joiner):**
    *   Open the app and click the "P2P Config" button.
    *   Change your role to "Player 2 (Joiner)".
    *   Select the same "Connection Method" as the host.
    *   Enter the **Host ID** you received from Player 1 and click "Connect".

3.  **Start Playing:**
    *   Once connected, the host can create teams from the config screen.
    *   All players can then join a team to start playing. Moves are synchronized in real-time!

---

### Technical Details

#### Peer-to-Peer Communication
The application's multiplayer functionality is powered by **WebRTC Data Channels**. This provides a low-latency, secure, and direct connection between browsers, removing the need for a central game server.

#### Signaling
WebRTC requires a "signaling" phase to exchange session metadata (SDP) between peers to establish a connection. This project supports three methods:
*   **PeerJS:** A service that simplifies the initial WebRTC handshake. The host gets a unique ID, and joiners use it to connect.
*   **QR Code:** A novel, serverless approach where the large SDP data is split into smaller chunks. Each chunk is encoded into a QR code with an index (`[1/5]:DATA`) for reassembly.
*   **Manual:** A fallback method where SDP data is manually copied and pasted between players.

#### Game Logic
All game logic is handled on the client side within modular JavaScript files.
*   **`game_manager.js`:** Dynamically loads and manages the active game module.
*   **`games/*.js`:** Each game (Sudoku, Connect 4, etc.) has its own file containing its unique rules, state management, and UI rendering logic.
*   **Real-Time Sync:** In multiplayer, moves are sent as JSON objects through the WebRTC data channel. The host acts as the authority, processing moves and broadcasting the updated game state to all connected peers.
