import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import db from '../db.js';

export function registerUserRoutes(app: FastifyInstance) {
  // 전체 사용자 목록 (master만)
  app.get('/api/users', { preHandler: authenticate }, async (request, reply) => {
    const { role } = (request as any).user;
    if (role !== 'master') return reply.code(403).send({ error: 'Forbidden' });

    return db.prepare('SELECT id, name, profileImage, role, provider, createdAt FROM users ORDER BY createdAt ASC').all();
  });

  // 사용자 삭제 (master만)
  app.delete('/api/users/:id', { preHandler: authenticate }, async (request, reply) => {
    const { role } = (request as any).user;
    if (role !== 'master') return reply.code(403).send({ error: 'Forbidden' });

    const targetId = parseInt((request.params as { id: string }).id);
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId) as any;
    if (!target) return reply.code(404).send({ error: 'Not found' });
    if (target.role === 'master') return reply.code(400).send({ error: 'Cannot delete master' });

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    return { ok: true };
  });
}
