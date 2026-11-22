import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

void document.fonts.load('400 15px "Roboto Flex"').catch(() => {}).then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
