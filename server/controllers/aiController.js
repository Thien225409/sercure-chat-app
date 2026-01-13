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

        // --- BUG FIX: Ensure first message is USER ---
        if (formattedHistory.length > 0 && formattedHistory[0].role !== 'user') {
            // Option 1: Insert a dummy prompt at start
            formattedHistory.unshift({ role: 'user', parts: [{ text: "Hello AI Assistant" }] });
        }
        // ---------------------------------------------

        const chat = model.startChat({
            history: formattedHistory,
            generationConfig: { maxOutputTokens: 2000 },
            systemInstruction: {
                role: "system",
                parts: [{ text: "Bạn là Trợ lý AI thông minh (Smart Chat Assistant) trong một ứng dụng nhắn tin bảo mật E2E. \n\nNHIỆM VỤ CỦA BẠN:\n1. Tóm tắt nội dung cuộc trò chuyện khi được hỏi.\n2. Đưa ra gợi ý, lời khuyên dựa trên ngữ cảnh chat.\n3. Trả lời NGẮN GỌN, SÚC TÍCH, thân thiện.\n4. Nếu người dùng hỏi về bảo mật, hãy khẳng định đây là ứng dụng an toàn tuyệt đối.\n\nLƯU Ý: Bạn đang đọc lịch sử chat của người dùng để hỗ trợ họ. Hãy tỏ ra hữu ích và thông minh." }]
            }
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