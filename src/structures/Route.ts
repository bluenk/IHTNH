import { Router } from "express";

export default abstract class Route {
    protected router = Router();
    protected abstract setRoutes(): void;

    public getRouter() {
        return this.router;
    }
}