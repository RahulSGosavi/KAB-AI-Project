import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

const AIDesignAssistant = () => {
  const { projectId } = useParams();
  const [activeTab, setActiveTab] = useState('analyze');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [results, setResults] = useState({});

  // Analysis state
  const [analysis, setAnalysis] = useState('');

  // Color palette state
  const [colorStyle, setColorStyle] = useState('modern');
  const [roomType, setRoomType] = useState('living room');
  const [colorPalette, setColorPalette] = useState('');

  // Material recommendations state
  const [budget, setBudget] = useState('medium');
  const [sustainability, setSustainability] = useState(false);
  const [materials, setMaterials] = useState('');

  // Cost estimate state
  const [squareFootage, setSquareFootage] = useState('');
  const [scope, setScope] = useState('full renovation');
  const [location, setLocation] = useState('United States');
  const [costEstimate, setCostEstimate] = useState('');
  const [aiProvider, setAiProvider] = useState('gpt-4');
  const [estimateMetadata, setEstimateMetadata] = useState(null);

  // Quick suggestion state
  const [quickQuestion, setQuickQuestion] = useState('');
  const [quickSuggestion, setQuickSuggestion] = useState('');

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post(
        `${API_BASE}/ai-design/analyze/${projectId}`,
        {},
        { headers }
      );
      
      setAnalysis(response.data.analysis);
      setToast({ type: 'success', message: 'Analysis complete!' });
    } catch (error) {
      console.error('Error:', error);
      const message = error.response?.data?.message || error.response?.data?.error || 'Analysis failed';
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleColorPalette = async () => {
    setLoading(true);
    setColorPalette('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post(
        `${API_BASE}/ai-design/color-palette/${projectId}`,
        { style: colorStyle, room_type: roomType },
        { headers }
      );
      
      setColorPalette(response.data.palette);
      setToast({ type: 'success', message: 'Color palette generated!' });
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to generate color palette';
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialRecommendations = async () => {
    setLoading(true);
    setMaterials('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post(
        `${API_BASE}/ai-design/material-recommendations/${projectId}`,
        { budget, sustainability },
        { headers }
      );
      
      setMaterials(response.data.recommendations);
      setToast({ type: 'success', message: 'Material recommendations ready!' });
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to generate recommendations';
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleCostEstimate = async () => {
    // Input validation
    if (!squareFootage || squareFootage <= 0) {
      setToast({ type: 'error', message: 'Please enter a valid square footage greater than 0' });
      return;
    }
    
    if (!location || location.trim() === '') {
      setToast({ type: 'error', message: 'Please enter a valid location' });
      return;
    }
    
    setLoading(true);
    setCostEstimate('');
    setEstimateMetadata(null);
    
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post(
        `${API_BASE}/ai-design/cost-estimate/${projectId}`,
        {
          square_footage: parseInt(squareFootage),
          scope,
          location: location.trim(),
          ai_provider: aiProvider
        },
        { headers }
      );
      
      setCostEstimate(response.data.estimate);
      setEstimateMetadata(response.data.metadata);
      setToast({ 
        type: 'success', 
        // âœ… FIXED: Safe .toUpperCase() with fallback
        message: `Cost estimate generated using ${(aiProvider || 'AI').toUpperCase()}!` 
      });
    } catch (error) {
      console.error('Cost estimate error:', error);
      let message = 'Failed to generate estimate';
      
      if (error.response?.data?.error) {
        message = error.response.data.error;
      } else if (error.response?.status === 429) {
        message = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (error.response?.status === 401) {
        message = 'API key not configured. Please contact support.';
      } else if (error.response?.status === 402) {
        message = 'API quota exceeded. Please contact support.';
      } else if (error.response?.status === 503) {
        message = 'AI service temporarily unavailable. Please try again later.';
      }
      
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSuggestion = async () => {
    if (!quickQuestion.trim()) {
      setToast({ type: 'error', message: 'Please enter a question' });
      return;
    }

    setLoading(true);
    setQuickSuggestion('');
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const response = await axios.post(
        `${API_BASE}/ai-design/quick-suggestion`,
        { question: quickQuestion },
        { headers }
      );
      
      setQuickSuggestion(response.data.suggestion);
      setToast({ type: 'success', message: 'Suggestion received!' });
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to get suggestion';
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'analyze', name: 'Project Analysis', icon: 'ðŸ”' },
    { id: 'colors', name: 'Color Palette', icon: 'ðŸŽ¨' },
    { id: 'materials', name: 'Materials', icon: 'ðŸ—ï¸' },
    { id: 'costs', name: 'Cost Estimate', icon: 'ðŸ’°' },
    { id: 'quick', name: 'Quick Help', icon: 'ðŸ’¡' },
  ];

  return (
    <div className="container mx-auto p-4 md:p-8">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">ðŸ¤– AI Design Assistant</h1>
        <p className="text-gray-600">Get AI-powered design suggestions and recommendations</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Project Analysis */}
        {activeTab === 'analyze' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">ðŸ“Š Comprehensive Project Analysis</h2>
            <p className="text-gray-600 mb-6">
              Get a detailed AI analysis of your project including space planning, materials, colors, and more.
            </p>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary mb-6"
            >
              {loading ? 'ðŸ¤– Analyzing...' : 'ðŸ” Analyze Project'}
            </button>

            {analysis && (
              <div className="bg-gray-50 rounded-lg p-6 whitespace-pre-wrap">
                {analysis}
              </div>
            )}
          </div>
        )}

        {/* Color Palette */}
        {activeTab === 'colors' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">ðŸŽ¨ AI Color Palette Generator</h2>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Design Style
                </label>
                <select
                  value={colorStyle}
                  onChange={(e) => setColorStyle(e.target.value)}
                  className="input-field"
                >
                  <option value="modern">Modern</option>
                  <option value="contemporary">Contemporary</option>
                  <option value="traditional">Traditional</option>
                  <option value="minimalist">Minimalist</option>
                  <option value="industrial">Industrial</option>
                  <option value="scandinavian">Scandinavian</option>
                  <option value="bohemian">Bohemian</option>
                  <option value="coastal">Coastal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Type
                </label>
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="input-field"
                >
                  <option value="living room">Living Room</option>
                  <option value="bedroom">Bedroom</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="bathroom">Bathroom</option>
                  <option value="dining room">Dining Room</option>
                  <option value="office">Home Office</option>
                  <option value="entryway">Entryway</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleColorPalette}
              disabled={loading}
              className="btn-primary mb-6"
            >
              {loading ? 'ðŸŽ¨ Generating...' : 'âœ¨ Generate Color Palette'}
            </button>

            {colorPalette && (
              <div className="bg-gray-50 rounded-lg p-6 whitespace-pre-wrap">
                {colorPalette}
              </div>
            )}
          </div>
        )}

        {/* Material Recommendations */}
        {activeTab === 'materials' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">ðŸ—ï¸ Material & Finish Recommendations</h2>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Budget Level
                </label>
                <select
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="input-field"
                >
                  <option value="low">Budget-Friendly</option>
                  <option value="medium">Mid-Range</option>
                  <option value="high">Premium/Luxury</option>
                </select>
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sustainability}
                    onChange={(e) => setSustainability(e.target.checked)}
                    className="w-5 h-5 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Prioritize Sustainable Materials
                  </span>
                </label>
              </div>
            </div>

            <button
              onClick={handleMaterialRecommendations}
              disabled={loading}
              className="btn-primary mb-6"
            >
              {loading ? 'ðŸ”¨ Analyzing...' : 'ðŸ“‹ Get Recommendations'}
            </button>

            {materials && (
              <div className="bg-gray-50 rounded-lg p-6 whitespace-pre-wrap">
                {materials}
              </div>
            )}
          </div>
        )}

        {/* Cost Estimate */}
        {activeTab === 'costs' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">ðŸ’° AI-Powered Cost Estimation</h2>
            <p className="text-gray-600 mb-6">
              Get detailed, accurate cost estimates powered by advanced AI. Choose your preferred AI provider for the most accurate results.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Square Footage *
                </label>
                <input
                  type="number"
                  value={squareFootage}
                  onChange={(e) => setSquareFootage(e.target.value)}
                  placeholder="e.g., 1500"
                  className="input-field"
                  min="1"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Required: Enter total project square footage</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Scope
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="input-field"
                >
                  <option value="full renovation">Full Renovation</option>
                  <option value="partial renovation">Partial Renovation</option>
                  <option value="kitchen remodel">Kitchen Remodel</option>
                  <option value="bathroom remodel">Bathroom Remodel</option>
                  <option value="new construction">New Construction</option>
                  <option value="cosmetic updates">Cosmetic Updates</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., New York, NY"
                  className="input-field"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Required: City, State for accurate local pricing</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Provider
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="input-field"
                >
                  <option value="gpt-4">GPT-4 (Most Accurate)</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Faster)</option>
                  <option value="grok">Grok AI (Coming Soon)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Choose your preferred AI for cost estimation</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">ðŸŽ¯ What You'll Get:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>â€¢ Detailed budget breakdown by category</li>
                <li>â€¢ Cost ranges with specific dollar amounts</li>
                <li>â€¢ Timeline estimates and project phases</li>
                <li>â€¢ Value engineering suggestions</li>
                <li>â€¢ Market insights for your location</li>
                <li>â€¢ Cost-saving alternatives and tips</li>
              </ul>
            </div>

            <button
              onClick={handleCostEstimate}
              disabled={loading || !squareFootage || !location}
              className="btn-primary mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'ðŸ’µ Calculating...' : 'ðŸ“Š Generate Detailed Estimate'}
            </button>

            {estimateMetadata && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-green-900 mb-2">ðŸ“Š Estimate Details</h3>
                <div className="text-sm text-green-800 space-y-1">
                  <p><strong>Generated:</strong> {new Date(estimateMetadata.generated_at).toLocaleString()}</p>
                  {/* âœ… FIXED: Safe .toUpperCase() with fallback */}
                  <p><strong>AI Provider:</strong> {(estimateMetadata.ai_provider || 'Unknown').toUpperCase()}</p>
                  <p><strong>Model:</strong> {estimateMetadata.model_used}</p>
                  <p><strong>Location:</strong> {estimateMetadata.location}</p>
                  <p><strong>Scope:</strong> {estimateMetadata.scope}</p>
                </div>
              </div>
            )}

            {costEstimate && (
              <div className="bg-gray-50 rounded-lg p-6 whitespace-pre-wrap border-l-4 border-blue-500">
                <div className="prose max-w-none">
                  {costEstimate}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Suggestion */}
        {activeTab === 'quick' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">ðŸ’¡ Quick Design Help</h2>
            <p className="text-gray-600 mb-6">
              Ask any design-related question and get instant AI-powered advice.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Question
              </label>
              <textarea
                value={quickQuestion}
                onChange={(e) => setQuickQuestion(e.target.value)}
                placeholder="e.g., What color should I paint my north-facing bedroom?"
                rows="4"
                className="input-field resize-none"
              />
            </div>

            <button
              onClick={handleQuickSuggestion}
              disabled={loading || !quickQuestion.trim()}
              className="btn-primary mb-6"
            >
              {loading ? 'ðŸ¤” Thinking...' : 'âœ¨ Get Suggestion'}
            </button>

            {quickSuggestion && (
              <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-6">
                <h3 className="font-semibold text-blue-900 mb-2">AI Suggestion:</h3>
                <div className="text-gray-800 whitespace-pre-wrap">{quickSuggestion}</div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="mt-6 bg-blue-50 border-l-4 border-blue-600 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>ðŸ’¡ Pro Tip:</strong> The AI Assistant works best when you have uploaded project files and provided detailed descriptions. All recommendations are AI-generated and should be verified with professional consultants.
        </p>
      </div>
    </div>
  );
};

export default AIDesignAssistant;