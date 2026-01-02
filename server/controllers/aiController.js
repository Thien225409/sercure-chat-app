import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

// Debug: Kiểm tra xem key có load được không
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ ERROR: Không tìm thấy GEMINI_API_KEY trong file .env!");
} else {
    // console.log(`✅ Loaded Gemini Cloud Key: ${apiKey.substring(0, 5)}...******`);
}

const genAI = new GoogleGenerativeAI(apiKey);

export async function chatWithGemini(socket, data) {
    try {
        const { prompt, history } = data;

        // SỬ DỤNG MODEL: gemini-2.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const validHistory = (history || []).filter(msg => msg.content && msg.content.type === 'TEXT');
        let formattedHistory = [];
        let lastRole = null;

        for (const msg of validHistory) {
            const role = msg.sender === 'Me' ? 'user' : 'model';
            const text = msg.content.text;

            if (role === lastRole) {
                if (formattedHistory.length > 0) {
                    formattedHistory[formattedHistory.length - 1].parts[0].text += `\n${text}`;
                }
            } else {
                formattedHistory.push({ role, parts: [{ text }] });
            }
            lastRole = role;
        }

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: { maxOutputTokens: 8192 }, // Tăng giới hạn token để không bị đứt quãng
        });

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();

        socket.emit('ai_response', { text, timestamp: new Date() });

    } catch (err) {
        console.error('❌ Gemini Error:', err.message);
        let msg = `(Lỗi AI) ${err.message}`;
        if (err.message.includes('404')) {
            msg = `(Lỗi AI) Model không tồn tại hoặc API Key lỗi.`;
        }
        socket.emit('ai_response', { text: msg });
    }
}