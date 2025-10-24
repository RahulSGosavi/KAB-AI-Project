import React, { useState, useEffect, useRef } from 'react';
import { projectsAPI } from '../services/api';

const MESSAGE_TYPES = {
  USER: 'user',
  AI: 'ai',
  SYSTEM: 'system',
  ERROR: 'error'
};

const FileAnalysisChat = ({ isOpen, onClose, projectFiles = [] }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [status, setStatus] = useState('idle');
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([{
        id: 1,
        type: MESSAGE_TYPES.SYSTEM,
        content: 'Welcome to AI Pricing Analysis!\nSelect your files below and ask me about SKU pricing, materials, and specifications.',
        timestamp: new Date()
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleFileSelection = (file) => {
    setSelectedFiles(prev => 
      prev.some(f => f.id === file.id)
        ? prev.filter(f => f.id !== file.id)
        : [...prev, file]
    );
  };

  const startAnalysis = () => {
    if (selectedFiles.length === 0) return;
    
    setShowSelector(false);
    setStatus('analyzing');
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: MESSAGE_TYPES.SYSTEM,
      content: `Analysis started with ${selectedFiles.length} file(s). You can now ask questions about pricing, materials, and specifications.`,
      timestamp: new Date()
    }]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: MESSAGE_TYPES.USER,
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await projectsAPI.analyzeFiles(selectedFiles.map(f => f.id), inputMessage);
      
      const aiMessage = {
        id: Date.now() + 1,
        type: MESSAGE_TYPES.AI,
        content: response.data.analysis || 'Analysis completed successfully.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        type: MESSAGE_TYPES.ERROR,
        content: `Error: ${error.response?.data?.error || error.message || 'Analysis failed'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-xl shadow-lg">
      <div className="flex items-center justify-between p-3 sm:p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-700">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">AI Pricing Analysis</h2>
            <p className="text-xs text-blue-100 hidden sm:block">Production-Quality Intelligence</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors">
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {showSelector && (
        <div className="p-3 sm:p-6 border-b bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">Select Files to Analyze</h3>
          </div>

          <div className="space-y-2 max-h-32 sm:max-h-48 overflow-y-auto mb-4">
            {projectFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No files available. Upload files first.</p>
              </div>
            ) : (
              projectFiles.map(file => (
                <label
                  key={file.id}
                  className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg cursor-pointer transition-all hover:bg-white ${
                    selectedFiles.some(f => f.id === file.id)
                      ? 'bg-indigo-50 border-2 border-indigo-500'
                      : 'bg-white border-2 border-gray-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.some(f => f.id === file.id)}
                    onChange={() => toggleFileSelection(file)}
                    className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm sm:text-base truncate">{file.name || file.filename}</p>
                    <p className="text-xs text-gray-500">
                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          <button
            onClick={startAnalysis}
            disabled={selectedFiles.length === 0}
            className="w-full py-2 sm:py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
            </svg>
            <span className="hidden sm:inline">Start Analysis ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})</span>
            <span className="sm:hidden">Start ({selectedFiles.length})</span>
          </button>
        </div>
      )}

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 bg-gray-50">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.type === MESSAGE_TYPES.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[80%] rounded-xl p-3 sm:p-4 shadow-sm ${
              msg.type === MESSAGE_TYPES.USER
                ? 'bg-indigo-600 text-white'
                : msg.type === MESSAGE_TYPES.ERROR
                ? 'bg-red-50 text-red-800 border border-red-200'
                : msg.type === MESSAGE_TYPES.SYSTEM
                ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                : 'bg-white text-gray-800 border border-gray-200'
            }`}>
              <p className="text-xs sm:text-sm whitespace-pre-wrap font-mono">{msg.content}</p>
              <p className="text-xs mt-2 opacity-70">{msg.timestamp.toLocaleTimeString()}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                <span className="text-sm">Analyzing...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!showSelector && (
        <div className="p-3 sm:p-5 border-t bg-white">
          <div className="flex gap-2 sm:gap-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about SKU pricing..."
              disabled={isLoading}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 text-sm sm:text-base"
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
              </svg>
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileAnalysisChat;