// /api/submit-message.js
export default async function handler(req, res) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持POST请求' });
  }

  try {
    const { username, email, content } = req.body;
    
    if (!username || !content) {
      return res.status(400).json({ error: '用户名和留言内容不能为空' });
    }

    // GitHub API配置
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // 从环境变量读取
    const REPO_OWNER = 'shawn1300';
    const REPO_NAME = 'shawn1300.github.io';
    const ISSUE_NUMBER = 1;
    
    // 构建留言内容
    const fullContent = `${username}||${email}||${content}`;
    
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

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      message: '留言提交成功',
      commentId: data.id,
      url: data.html_url
    });

  } catch (error) {
    console.error('提交留言失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
