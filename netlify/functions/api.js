import serverless from 'serverless-http';
import app from '../../src/app.js';

const serverlessHandler = serverless(app, {
    binary: ['image/*', 'application/pdf'],
});

export const handler = async (event, context) => {
    try {
        return await serverlessHandler(event, context);
    } catch (err) {
        console.error('Netlify function error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: 'Server error. Check Netlify function logs.',
                detail: process.env.NODE_ENV === 'production' ? undefined : err?.message,
            }),
        };
    }
};
