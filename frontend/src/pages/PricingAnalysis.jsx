import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../services/api';
import FileAnalysisChat from '../components/FileAnalysisChat';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';

const PricingAnalysis = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const response = await projectsAPI.getById(id);
      setProject(response.data);
    } catch (error) {
      showToast('Failed to load project', 'error');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!project) {
    return (
      <div className="container-responsive py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Project not found</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="container-responsive py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => navigate(`/project/${id}`)}
                className="text-gray-600 hover:text-gray-800 transition-colors p-1"
              >
                <i className="fas fa-arrow-left text-lg sm:text-xl"></i>
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">AI Pricing Analysis</h1>
                <p className="text-sm sm:text-base text-gray-600 truncate">Project: {project.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                {project.files ? project.files.length : 0} files
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Analysis Component */}
      <div className="flex-1 p-2 sm:p-4 lg:p-6">
        <div className="h-full">
          <FileAnalysisChat
            isOpen={true}
            onClose={() => navigate(`/project/${id}`)}
            projectFiles={project.files || []}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default PricingAnalysis;
