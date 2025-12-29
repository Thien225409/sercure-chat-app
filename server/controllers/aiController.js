import { GoogleGenerativeAI } from "@google/generative-ai";

// Đảm bảo bạn đã có GEMINI_API_KEY trong file .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function chatWithGemini(socket, data) {
    try {
        const { prompt, history } = data; 
        // history: mảng các tin nhắn trước đó để AI nhớ ngữ cảnh (nếu muốn)
        
        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        
        // Nếu muốn chat có ngữ cảnh, bạn cần build history object theo format của Gemini
        // Ở đây làm đơn giản là gửi prompt
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Gửi phản hồi lại riêng cho người hỏi
        socket.emit('ai_response', { 
            text: text,
            timestamp: new Date()
        });

    } catch (err) {
        console.error('Gemini API Error:', err);
        socket.emit('ai_error', { message: 'AI không phản hồi lúc này.' });
    }
}