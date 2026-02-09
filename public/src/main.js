import { Application, Graphics } from "pixi.js";

const application = new Application();

await application.init({
  resizeTo: window,
  background: "#1a1a1a",
  antialias: true
});

const appContainerElement = document.getElementById("app");

if (!appContainerElement) {
  throw new Error("Missing #app container element.");
}

appContainerElement.appendChild(application.canvas);

const demoHexShape = new Graphics();
demoHexShape.poly([
  50, 0,
  95, 26,
  95, 78,
  50, 104,
  5, 78,
  5, 26
]);
demoHexShape.stroke({ width: 3, color: 0xe6e6e6 });
demoHexShape.fill(0x3a78ff);
demoHexShape.position.set(40, 40);

application.stage.addChild(demoHexShape);
