// /api/submit-comment.js
export default async function handler(req, res) {
  // ========== 修复CORS配置 ==========
  // 允许的域名列表
  const allowedOrigins = [
    'https://shawn1300.github.io',
    'https://gezi.de5.net',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080'
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ========== CORS修复结束 ==========
  
  // 只处理POST请求 - 但返回更友好的错误信息
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: '只支持POST请求',
      allowed_methods: ['POST'],
      current_method: req.method
    });
  }
  
  try {
    // 确保有请求体
    if (!req.body) {
      return res.status(400).json({ 
        success: false, 
        error: '请求体为空，请提供JSON数据' 
      });
    }
    
    const { username, email, content } = req.body;
    
    // 验证必要字段
    if (!username || !content) {
      return res.status(400).json({ 
        success: false, 
        error: '用户名和留言内容不能为空',
        required_fields: ['username', 'content']
      });
    }
    
    // 从环境变量获取配置
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.REPO_OWNER || 'shawn1300';
    const REPO_NAME = process.env.REPO_NAME || 'shawn1300.github.io';
    const ISSUE_NUMBER = process.env.COMMENT_ISSUE_NUMBER || 1;
    
    if (!GITHUB_TOKEN) {
      console.error('GitHub Token未设置');
      return res.status(500).json({ 
        success: false, 
        error: '服务器配置错误' 
      });
    }
    
    // 构建留言内容
    const fullContent = `**${username}**${email ? ` (${email})` : ''} 留言：\n\n${content}\n\n---\n*时间: ${new Date().toLocaleString('zh-CN')}*`;
    
    console.log('正在提交留言到GitHub...', { username, email });
    
    // 调用GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Shawn-Blog-Comments'
        },
        body: JSON.stringify({ body: fullContent })
      }
    );
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('GitHub API错误:', response.status, responseText);
      let errorMessage = `GitHub API返回 ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果不是JSON，直接使用文本
      }
      
      return res.status(response.status).json({
        success: false,
        error: errorMessage,
        github_status: response.status
      });
    }
    
    const data = JSON.parse(responseText);
    
    console.log('留言提交成功:', data.id);
    
    // 返回成功响应
    return res.status(200).json({
      success: true,
      message: '留言提交成功！',
      commentId: data.id,
      commentUrl: data.html_url,
      timestamp: new Date().toISOString(),
      preview: {
        username: username,
        content_preview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
      }
    });
    
  } catch (error) {
    console.error('提交留言时出错:', error);
    
    // 返回详细的错误信息
    return res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
      error_type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
