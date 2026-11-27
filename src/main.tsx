import React from "react";
import ReactDOM from "react-dom/client";
import KmbBusPage from "../bus.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <KmbBusPage />
  </React.StrictMode>,
);
