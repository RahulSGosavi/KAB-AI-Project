import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../services/api';
import { discussionsAPI } from '../services/api';
import { formatDate, formatFileSize, getFileIcon } from '../utils/helpers';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import FileAnalysisChat from '../components/FileAnalysisChat';

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('files');
  
  
  // Discussion State
  const [discussions, setDiscussions] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingDiscussions, setLoadingDiscussions] = useState(false);
  
  // Pricing Chat State
  const [isPricingChatOpen, setIsPricingChatOpen] = useState(false);
  

  useEffect(() => {
    loadProject();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'discussion') {
      loadDiscussions();
    }
  }, [activeTab]);

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


  const loadDiscussions = async () => {
    try {
      setLoadingDiscussions(true);
      const response = await discussionsAPI.getByProject(id);
      setDiscussions(response.data);
    } catch (error) {
      showToast('Failed to load discussions', 'error');
    } finally {
      setLoadingDiscussions(false);
    }
  };


  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await discussionsAPI.create({ project_id: parseInt(id), message: newMessage });
      setNewMessage('');
      loadDiscussions();
    } catch (error) {
      showToast('Failed to send message', 'error');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploading(true);
      await projectsAPI.uploadFile(id, formData);
      showToast('File uploaded successfully!', 'success');
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      loadProject();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to upload file', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;

    try {
      await projectsAPI.delete(id);
      showToast('Project deleted successfully', 'success');
      navigate('/dashboard');
    } catch (error) {
      showToast('Failed to delete project', 'error');
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="container-responsive py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-2"
          >
            <i className="fas fa-arrow-left"></i>
            <span>Back to Dashboard</span>
          </button>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                {project.name}
              </h1>
              <p className="text-gray-600">{project.description || 'No description'}</p>
              <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                <span>
                  <i className="fas fa-calendar mr-1"></i>
                  Created {formatDate(project.created_at)}
                </span>
                <span>
                  <i className="fas fa-file mr-1"></i>
                  {project.files?.length || 0} files
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="btn-primary flex items-center gap-2"
              >
                <i className="fas fa-upload"></i>
                Upload File
              </button>
              <button
                onClick={handleDeleteProject}
                className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <i className="fas fa-trash"></i>
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Files Grid - Only show when files tab is active */}
        {activeTab === 'files' && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Project Files</h2>
            
            {project.files && project.files.length > 0 ? (
              <div className="grid-responsive">
                {project.files.map((file) => (
                  <div key={file.id} className="card hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i className={`fas ${getFileIcon(file.type)} text-2xl`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate mb-1">
                          {file.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(file.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline flex-1 text-center text-sm py-2"
                      >
                        <i className="fas fa-eye mr-1"></i>
                        View
                      </a>
                      <button
                        onClick={() => navigate(`/project/${project.id}/annotate/${file.id}`, { state: { file } })}
                        className="btn-primary flex-1 text-center text-sm py-2"
                      >
                        <i className="fas fa-edit mr-1"></i>
                        Annotate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
                <i className="fas fa-file-upload text-gray-300 text-5xl mb-4"></i>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No files uploaded</h3>
                <p className="text-gray-500 mb-4">Upload your first file to get started</p>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="btn-primary"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Upload File
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('files')}
            className={`card hover:shadow-lg transition-shadow text-left group ${activeTab === 'files' ? 'ring-2 ring-gray-500' : ''}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-folder text-gray-600 text-xl"></i>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Files</h3>
                <p className="text-sm text-gray-500">View uploads</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('discussion')}
            className={`card hover:shadow-lg transition-shadow text-left group ${activeTab === 'discussion' ? 'ring-2 ring-purple-500' : ''}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-comments text-purple-600 text-xl"></i>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Discussion</h3>
                <p className="text-sm text-gray-500">Team chat</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => setIsPricingChatOpen(true)}
            className="card hover:shadow-lg transition-shadow text-left group bg-gradient-to-r from-blue-500 to-purple-600 text-white"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <i className="fas fa-dollar-sign text-white text-xl"></i>
              </div>
              <div>
                <h3 className="font-semibold text-white">Pricing</h3>
                <p className="text-sm text-blue-100">AI File Analysis</p>
              </div>
            </div>
          </button>
        </div>


        {/* Discussion Tab */}
        {activeTab === 'discussion' && (
          <div className="card">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Team Discussion</h3>
            
            {/* Messages List */}
            <div className="mb-6 max-h-96 overflow-y-auto space-y-4">
              {loadingDiscussions ? (
                <LoadingSpinner />
              ) : discussions.length > 0 ? (
                discussions.map((d) => (
                  <div key={d.id} className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="fas fa-user text-purple-600"></i>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-gray-900">{d.user_name}</p>
                        <p className="text-xs text-gray-500">{formatDate(d.created_at)}</p>
                      </div>
                      <p className="text-gray-700">{d.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <i className="fas fa-comments text-4xl mb-3 block"></i>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}
            </div>

            {/* Send Message Form */}
            <form onSubmit={handleSendMessage} className="border-t pt-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="input-field flex-1"
                />
                <button type="submit" className="btn-primary">
                  <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </form>
          </div>
        )}

      </div>

      {/* Upload File Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setSelectedFile(null);
        }}
        title="Upload File"
      >
        <form onSubmit={handleFileUpload} className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
            <input
              type="file"
              id="fileInput"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
            />
            <label htmlFor="fileInput" className="cursor-pointer">
              <i className="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4 block"></i>
              <p className="text-gray-700 font-medium mb-2">
                {selectedFile ? selectedFile.name : 'Click to select file'}
              </p>
              <p className="text-sm text-gray-500">
                Supported: PDF, Excel, Images (Max 50MB)
              </p>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsUploadModalOpen(false);
                setSelectedFile(null);
              }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <i className="fas fa-upload"></i>
                  Upload
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* File Analysis Chat */}
      <FileAnalysisChat
        isOpen={isPricingChatOpen}
        onClose={() => setIsPricingChatOpen(false)}
        projectFiles={project?.files || []}
      />
    </div>
  );
};

export default ProjectDetail;

