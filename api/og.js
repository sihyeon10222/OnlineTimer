import { ImageResponse } from '@vercel/og';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    // Simple test - just return a basic image
    const element = {
        type: 'div',
        props: {
            style: {
                display: 'flex',
                fontSize: 100,
                background: 'teal',
                color: 'white',
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                alignItems: 'center',
            },
            children: 'Hello OG!'
        }
    };

    return new ImageResponse(element, {
        width: 1200,
        height: 630,
    });
}
