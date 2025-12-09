export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', 'https://shawn1300.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // 配置 - 从环境变量读取或使用默认值
    const REPO_OWNER = process.env.REPO_OWNER || 'shawn1300';
    const REPO_NAME = process.env.REPO_NAME || 'shawn1300.github.io';
    const ISSUE_NUMBER = process.env.COMMENT_ISSUE_NUMBER || 1;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      throw new Error('GitHub Token未配置');
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}/comments`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Shawn-Blog'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API错误: ${response.status} - ${await response.text()}`);
    }
    
    const comments = await response.json();
    
    res.status(200).json({
      success: true,
      count: comments.length,
      comments: comments
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
