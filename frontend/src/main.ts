import "./styles.css";
import { GameApp } from "./ui/app";

const root = document.getElementById("app");
if (!root) throw new Error("app root not found");

new GameApp(root).mount();