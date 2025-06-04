class ChatBot {
  constructor() {
    this.chatbox = document.getElementById("chatbox");
    this.messageInput = document.getElementById("message");
    this.sendBtn = document.getElementById("sendBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.exportBtn = document.getElementById("exportBtn");
    this.attachBtn = document.getElementById("attachBtn");
    this.voiceBtn = document.getElementById("voiceBtn");
    this.fileInput = document.getElementById("fileInput");
    this.status = document.getElementById("status");

    this.isFirstMessage = true;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.chatHistory = [];

    this.initializeEventListeners();
    this.checkBrowserSupport();
  }

  initializeEventListeners() {
    this.sendBtn.onclick = () => this.sendMessage();

    // Check if elements exist before adding listeners
    if (this.clearBtn) this.clearBtn.onclick = () => this.clearChat();
    if (this.exportBtn) this.exportBtn.onclick = () => this.exportChat();
    if (this.attachBtn) this.attachBtn.onclick = () => this.fileInput.click();
    if (this.voiceBtn)
      this.voiceBtn.onclick = () => this.toggleVoiceRecording();

    if (this.fileInput)
      this.fileInput.onchange = (e) => this.handleFileUpload(e);

    this.messageInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !this.sendBtn.disabled) {
        event.preventDefault();
        this.sendMessage();
      }
    });

    this.messageInput.addEventListener("input", () => {
      this.autoResize();
    });

    // Focus on input when page loads
    this.messageInput.focus();
  }

  checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (this.voiceBtn) this.voiceBtn.style.display = "none";
    }
  }

  autoResize() {
    // Reset height để tính toán chính xác
    this.messageInput.style.height = "auto";

    // Tính toán chiều cao mới
    const scrollHeight = this.messageInput.scrollHeight;
    const minHeight = 24;
    const maxHeight = 120;

    // Áp dụng chiều cao mới trong giới hạn
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    this.messageInput.style.height = newHeight + "px";

    // Hiển thị scrollbar nếu cần
    if (scrollHeight > maxHeight) {
      this.messageInput.style.overflowY = "auto";
    } else {
      this.messageInput.style.overflowY = "hidden";
    }
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    // Remove empty state on first message
    if (this.isFirstMessage) {
      this.chatbox.innerHTML = "";
      this.isFirstMessage = false;
    }

    // Disable input while processing
    this.setInputState(false);
    this.updateStatus("Đang xử lý...");

    // Add user message
    this.addMessage(message, "user");
    this.chatHistory.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });
    this.messageInput.value = "";
    this.autoResize();

    // Add loading message
    const loadingId = this.addLoadingMessage();

    try {
      console.log("Sending message:", message);

      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ message }),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      // Remove loading message
      this.removeLoadingMessage(loadingId);

      // Check if response is ok
      if (!response.ok) {
        let errorMessage = `HTTP Error: ${response.status}`;

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonError) {
          console.error("Failed to parse error JSON:", jsonError);
          errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        }

        this.addMessage(`Lỗi: ${errorMessage}`, "bot", true);
        this.updateStatus("Có lỗi xảy ra");
        return;
      }

      // Check content type
      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error("Non-JSON response:", textResponse);
        this.addMessage(
          "Lỗi: Server trả về dữ liệu không đúng định dạng",
          "bot",
          true
        );
        this.updateStatus("Lỗi định dạng");
        return;
      }

      // Parse JSON response
      let data;
      try {
        const responseText = await response.text();
        console.log("Raw response:", responseText);

        if (!responseText.trim()) {
          throw new Error("Empty response from server");
        }

        data = JSON.parse(responseText);
        console.log("Parsed response:", data);
      } catch (jsonError) {
        console.error("JSON parse error:", jsonError);
        this.addMessage("Lỗi: Không thể đọc phản hồi từ server", "bot", true);
        this.updateStatus("Lỗi phân tích dữ liệu");
        return;
      }

      // Handle successful response
      if (data.response) {
        this.addMessage(data.response, "bot");
        this.chatHistory.push({
          role: "bot",
          content: data.response,
          timestamp: new Date(),
        });
        this.updateStatus("Sẵn sàng trò chuyện");
      } else if (data.error) {
        this.addMessage(`Lỗi: ${data.error}`, "bot", true);
        this.updateStatus("Có lỗi xảy ra");
      } else {
        this.addMessage("Lỗi: Phản hồi không hợp lệ từ server", "bot", true);
        this.updateStatus("Lỗi không xác định");
      }
    } catch (error) {
      console.error("Network error:", error);
      this.removeLoadingMessage(loadingId);

      let errorMessage = "Lỗi kết nối";
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        errorMessage =
          "Không thể kết nối đến server. Vui lòng kiểm tra server đã chạy chưa.";
      } else if (error.message.includes("JSON")) {
        errorMessage = "Lỗi xử lý dữ liệu từ server";
      } else {
        errorMessage = `Lỗi: ${error.message}`;
      }

      this.addMessage(errorMessage, "bot", true);
      this.updateStatus("Lỗi kết nối");
    } finally {
      // Re-enable input
      this.setInputState(true);
      this.messageInput.focus();
    }
  }

  addMessage(text, sender, isError = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const avatar =
      sender === "user"
        ? '<div class="message-avatar"><i class="fas fa-user"></i></div>'
        : '<div class="message-avatar"><i class="fas fa-robot"></i></div>';

    const time = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Xử lý text để tránh XSS và format tốt hơn
    const safeText = this.escapeHtml(text);

    const content = `
      ${sender === "bot" ? avatar : ""}
      <div class="message-content ${isError ? "error" : ""}">
        ${this.formatMessage(safeText)}
        <div class="message-time">${time}</div>
      </div>
      ${sender === "user" ? avatar : ""}
    `;

    messageDiv.innerHTML = content;
    this.chatbox.appendChild(messageDiv);
    this.scrollToBottom();
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  formatMessage(text) {
    // Cải thiện markdown support và xử lý line breaks
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>")
      .replace(/^(.*)$/, "<p>$1</p>");
  }

  addLoadingMessage() {
    const loadingId = "loading-" + Date.now();
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot";
    messageDiv.id = loadingId;

    messageDiv.innerHTML = `
      <div class="message-avatar"><i class="fas fa-robot"></i></div>
      <div class="message-content">
        <div class="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        Đang xử lý...
      </div>
    `;

    this.chatbox.appendChild(messageDiv);
    this.scrollToBottom();
    return loadingId;
  }

  removeLoadingMessage(loadingId) {
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) {
      loadingElement.remove();
    }
  }

  setInputState(enabled) {
    this.sendBtn.disabled = !enabled;
    this.messageInput.disabled = !enabled;
    this.sendBtn.innerHTML = enabled
      ? '<i class="fas fa-paper-plane"></i>'
      : '<i class="fas fa-spinner fa-spin"></i>';
  }

  updateStatus(message) {
    if (this.status) {
      this.status.textContent = message;
    }
  }

  scrollToBottom() {
    this.chatbox.scrollTop = this.chatbox.scrollHeight;
  }

  clearChat() {
    if (confirm("Bạn có chắc muốn xóa toàn bộ cuộc trò chuyện?")) {
      this.chatbox.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <h3>Chào mừng bạn!</h3>
          <p>Hãy bắt đầu cuộc trò chuyện với Gemini AI</p>
        </div>
      `;
      this.isFirstMessage = true;
      this.chatHistory = [];
      this.updateStatus("Sẵn sàng trò chuyện");
    }
  }

  exportChat() {
    if (this.chatHistory.length === 0) {
      alert("Không có cuộc trò chuyện nào để xuất!");
      return;
    }

    const chatText = this.chatHistory
      .map((msg) => {
        const time = msg.timestamp.toLocaleString("vi-VN");
        const sender = msg.role === "user" ? "Bạn" : "Gemini";
        return `[${time}] ${sender}: ${msg.content}`;
      })
      .join("\n\n");

    const blob = new Blob([chatText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Add file attachment indicator
    const fileInfo = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    this.addMessage(fileInfo, "user");

    // Reset file input
    event.target.value = "";
  }

  async toggleVoiceRecording() {
    if (!this.isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.startRecording(stream);
      } catch (error) {
        alert("Không thể truy cập microphone: " + error.message);
      }
    } else {
      this.stopRecording();
    }
  }

  startRecording(stream) {
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: "audio/wav" });
      // Here you would typically send the audio to a speech-to-text service
      this.addMessage(
        "🎤 Đã ghi âm (chức năng speech-to-text đang phát triển)",
        "user"
      );
    };

    this.mediaRecorder.start();
    this.isRecording = true;
    if (this.voiceBtn) {
      this.voiceBtn.classList.add("recording");
      this.voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
    }
    this.updateStatus("Đang ghi âm...");
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    this.isRecording = false;
    if (this.voiceBtn) {
      this.voiceBtn.classList.remove("recording");
      this.voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
    this.updateStatus("Sẵn sàng trò chuyện");
  }
}

// Initialize chatbot when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new ChatBot();
});
