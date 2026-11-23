import React from "react";
import ReactDOM from "react-dom/client";
// Montserrat (guide §8.3), bundled locally so the font works even when Google Fonts is blocked.
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
