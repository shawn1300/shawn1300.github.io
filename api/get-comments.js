// /api/get-comments.js
export default async function handler(req, res) {
  // ========== 同样的CORS配置 ==========
  const allowedOrigins = [
    'https://shawn1300.github.io',
    'https://gezi.de5.net',
    'http://localhost:3000',
    'http://localhost:5500'
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ========== CORS结束 ==========
  
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.REPO_OWNER || 'shawn1300';
    const REPO_NAME = process.env.REPO_NAME || 'shawn1300.github.io';
    const ISSUE_NUMBER = process.env.COMMENT_ISSUE_NUMBER || 1;
    
    if (!GITHUB_TOKEN) {
      throw new Error('GitHub Token未配置');
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API错误: ${response.status}`);
    }
    
    const comments = await response.json();
    
    res.status(200).json({
      success: true,
      count: comments.length,
      comments: comments,
      api_info: {
        endpoint: 'get-comments',
        allowed_origins: allowedOrigins,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('获取留言失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      comments: []
    });
  }
}
