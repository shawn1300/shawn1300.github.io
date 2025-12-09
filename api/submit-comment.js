export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', 'https://shawn1300.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持POST请求' });
  }
  
  try {
    const { username, email, content } = req.body;
    
    if (!username || !content) {
      return res.status(400).json({ error: '用户名和留言内容不能为空' });
    }
    
    // 配置
    const REPO_OWNER = process.env.REPO_OWNER || 'shawn1300';
    const REPO_NAME = process.env.REPO_NAME || 'shawn1300.github.io';
    const ISSUE_NUMBER = process.env.COMMENT_ISSUE_NUMBER || 1;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      throw new Error('GitHub Token未配置');
    }
    
    // 构建留言内容
    const fullContent = `
**${username}** 留言：
${content}

---
*邮箱: ${email || '未提供'}*  
*时间: ${new Date().toLocaleString('zh-CN')}*
    `.trim();
    
    // 调用GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Shawn-Blog'
        },
        body: JSON.stringify({ body: fullContent })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API错误: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    res.status(200).json({
      success: true,
      message: '留言提交成功',
      commentId: data.id,
      commentUrl: data.html_url
    });
    
  } catch (error) {
    console.error('提交留言失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
