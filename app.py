from flask import Flask, request, jsonify, send_from_directory
import requests
import os
import json

app = Flask(__name__)

# Move API key to environment variable for security
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAzlf_7PgIL5LwjoOv_EEhULlFW9oFUYyw")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

@app.route('/style.css')
def style():
    return send_from_directory('.', 'style.css')

@app.route('/script.js')
def script():
    return send_from_directory('.', 'script.js')

@app.route("/chat", methods=["POST"])
def chat():
    try:
        # Validate request
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
            
        user_input = data.get("message", "").strip()
        if not user_input:
            return jsonify({"error": "No message provided"}), 400

        # Validate API key
        if not GEMINI_API_KEY or GEMINI_API_KEY == "your-api-key-here":
            return jsonify({"error": "API key not configured"}), 500

        payload = {
            "contents": [
                {
                    "parts": [{"text": user_input}]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 1024,
            },
            "safetySettings": [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        }

        headers = {
            "Content-Type": "application/json"
        }

        print(f"Sending request to Gemini API: {user_input[:100]}...")
        
        response = requests.post(
            GEMINI_URL, 
            json=payload, 
            headers=headers, 
            timeout=30
        )
        
        print(f"Gemini API response status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"Gemini API response data: {json.dumps(data, indent=2)}")
                
                # Check if response has the expected structure
                if "candidates" in data and len(data["candidates"]) > 0:
                    candidate = data["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        if len(candidate["content"]["parts"]) > 0:
                            reply = candidate["content"]["parts"][0].get("text", "")
                            if reply:
                                return jsonify({"response": reply})
                            else:
                                return jsonify({"error": "Empty response from AI"}), 500
                        else:
                            return jsonify({"error": "No content parts in response"}), 500
                    else:
                        return jsonify({"error": "Invalid content structure"}), 500
                else:
                    # Check for blocked content
                    if "candidates" in data and len(data["candidates"]) > 0:
                        candidate = data["candidates"][0]
                        if "finishReason" in candidate:
                            reason = candidate["finishReason"]
                            if reason == "SAFETY":
                                return jsonify({"error": "Content was blocked due to safety concerns"}), 400
                            elif reason == "RECITATION":
                                return jsonify({"error": "Content was blocked due to recitation"}), 400
                    
                    return jsonify({
                        "error": "Unexpected response format", 
                        "raw": data
                    }), 500
                    
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}")
                return jsonify({
                    "error": "Invalid JSON response from API", 
                    "details": str(e),
                    "raw_response": response.text[:500]
                }), 500
                
        elif response.status_code == 400:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", "Bad request")
                return jsonify({"error": f"API Error: {error_msg}"}), 400
            except:
                return jsonify({
                    "error": "Bad request to API", 
                    "details": response.text[:200]
                }), 400
                
        elif response.status_code == 403:
            return jsonify({"error": "API key invalid or quota exceeded"}), 403
            
        elif response.status_code == 429:
            return jsonify({"error": "Rate limit exceeded. Please try again later"}), 429
            
        else:
            print(f"API error response: {response.text}")
            return jsonify({
                "error": f"API returned status {response.status_code}", 
                "details": response.text[:200]
            }), 500
    
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timeout. Please try again"}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Connection error. Please check your internet"}), 503
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({"error": "Network error", "details": str(e)}), 503
    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify({"error": "Server error", "details": str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    print("Starting Flask app...")
    print(f"API Key configured: {'Yes' if GEMINI_API_KEY and GEMINI_API_KEY != 'your-api-key-here' else 'No'}")
    app.run(debug=True, host='127.0.0.1', port=5000)