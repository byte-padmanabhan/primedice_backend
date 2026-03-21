import { Router } from 'express';
import { placeBet,getBetHistory } from '../controller/bet.controller.js';
import authenticate from '../middleware/auth.middleware.js';

const betRouter = Router();

betRouter.post('/', authenticate, placeBet);
betRouter.get('/history', authenticate, getBetHistory);

export default betRouter;