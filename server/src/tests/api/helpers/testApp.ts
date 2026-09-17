import request from 'supertest';
import app from '../../../app.js';

export { app, request };
export const api = request(app);
