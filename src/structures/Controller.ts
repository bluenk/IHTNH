import { NextFunction, Request, Response } from "express";

export default abstract class Controller {
    public abstract execute(req: Request, res: Response, next: NextFunction): void;
}