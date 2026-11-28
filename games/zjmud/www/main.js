
var sock = io.connect();
var loginok = false;
var textcol = '#ddd'; pd_on = 'chat';
var dirnw='　',dirn='　',dirne='　',dirw='　',dire='　',dirsw='　',dirso='　',dirse='　',tit = '指文游', titled = tit + '－' + '本地单机';
var scrw = $(window).width(), scrh = $(window).height();
// 手机浏览器里视口大小会变：横竖屏切换、地址栏收起、软键盘弹出。
// 只在这里读一次会让布局停在打开页面时的尺寸，所以每次重排前都重新取一次。
function refreshViewport() {
	scrw = $(window).width();
	scrh = $(window).height();
	if (window.visualViewport) {
		scrh = Math.round(Math.min(scrh, window.visualViewport.height));
	}
}
var dialog_title = "",strsss = "";
var ansi_flag = false;
var chatob = $('div#chat');
var longob = $('div#long');
var leftob = $('div#mleft');
var rightob = $('div#mright');
var menuob = $('div#menu');
var mycmdsob = $('div#mycmds');
var exitsob = $('div#exits');
var actsob = $('div#acts');
var objob = $('div#obj');
var hpsob = $('div#hps');
var hudongob = $('div#hudong');
var outob = $('div#out');
var tbarob = $('div#tbar');
var hereob = $('div#here');
var tmenuob = $('div#tmenu');
var Wp1 = '#$dm@%!*33'; //客户端key验证码
var user_key = 'Abcd1234Zwy';
var chat_height = 0;
var lastLayoutSig = '';

//防止查看源码(禁止鼠标左右功能键)
window.onload_disabled = function() {
	document.onkeydown = function() {
		var e = window.event || arguments[0];
		if(e.keyCode == 123) {
			return false;
		} else if((e.ctrlKey) && (e.shiftKey) && (e.keyCode == 73)) {
			return false;
		} else if((e.shiftKey) && (e.keyCode == 121)) {
			return false;
		}
	};
	document.oncontextmenu = function() {
		return false;
	}
}

function htmlEncode ( str ) {
  var ele = document.createElement('span');
  ele.appendChild( document.createTextNode( str ) );
  return ele.innerHTML;
};

function htmlDecode ( str ) {
  var ele = document.createElement('span');
  ele.innerHTML = str;
  return ele.textContent;
};

function ansistr(str)
{
	if(ansi_flag)
		str = ansi_up.ansi_to_html(str);
	else
		str = ansi_up.ansi_to_text(str);
	return str;
}

function setCookie(name,value)
{
	var Days = 30;
	var exp = new Date();
	exp.setTime(exp.getTime() + Days*24*60*60*1000);
	document.cookie = name + "="+ escape (value) + ";expires=" + exp.toGMTString();
};

function getCookie(name)
{
	var arr,reg=new RegExp("(^| )"+name+"=([^;]*)(;|$)");
	if(arr=document.cookie.match(reg))
	{
		return unescape(arr[2]);
	}
	else
	{
		return "";
	}
};

function delCookie(name) 
{ 
    var exp = new Date(); 
    exp.setTime(exp.getTime() - 1); 
    var cval=getCookie(name); 
    if(cval!=null) 
        document.cookie= name + "="+cval+";expires="+exp.toGMTString(); 
} 

function GetStr(name)
{
     var reg = new RegExp("(^|&)"+ name +"=([^&]*)(&|$)");

     var r = window.location.search.substr(1).match(reg);

     if(r!=null)return  decodeURI(r[2]);
     return "";
};

function cmds(str) {
	if(str.value)
		dialog_title = str.value;
	else
		dialog_title = str.innerHTML;
	sock.emit('stream',str.id+'\n');
};

function cmdsa(str) {
	if(str.value)
		dialog_title = str.value;
	else
		dialog_title = str.innerHTML;
	sock.emit('stream',str.id+'\n');
	hudongob.dialog("close");
};

function cmdsb() {
	if($('textarea#chatmsg').val()=='') return; 
	pushCmdHistory($('textarea#chatmsg').val());
	sock.emit('stream',$('textarea#chatmsg').val()+'\n');
	hudongob.dialog("close");
	document.getElementById("chatmsg").value="";
};

function cmdsc(str) {
	hudongob.dialog("close");
	mycmdsob.hide();
	if(str.id.substr(0,4)=='020')
	{
		writeToPop(str.id.substr(4));
	}
	else
	{
		sock.emit('stream',str.id+'\n');
	}
};

function says(str) {
	if($('textarea#chatmsg').val()=='') return;
	pushCmdHistory($('textarea#chatmsg').val());
	sock.emit('stream',str.id.replace('$txt#',$('textarea#chatmsg').val())+'\n');
	hudongob.dialog("close");
	document.getElementById("chatmsg").value="";
};

function writeToST(str) {
	longob.html('');
	exitsob.html('');
	objob.html('');
	mycmdsob.html('');
	mycmdsob.hide();
	actsob.html('');
	dirnw='　';
	dirn='　';
	dirne='　';
	dirw='　';
	dire='　';
	dirsw='　';
	dirso='　';
	dirse='　';
	tit = ansistr(str);
	hereob.html('<span>'+tit+'</span>');
};

function writedirs() {
	exitsob.html('<table width="100%" border="0" cellspacing="1" cellpadding="0">'
					+'<tr>'
						+'<td width="33%" style="height:30px" align="center">'+dirnw+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+dirn+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+dirne+'</td>'
					+'</tr>'
					+'<tr>'
						+'<td width="33%" style="height:30px" align="center">'+dirw+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+tit+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+dire+'</td>'
					+'</tr>'
					+'<tr>'
						+'<td width="33%" style="height:30px" align="center">'+dirsw+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+dirso+'</td>'
						+'<td width="33%" style="height:30px" align="center">'+dirse+'</td>'
					+'</tr>'
				+'</table>');
};

function writeToEX(str) {
	var strs = str.split("$zj#");
	var idss = "";
	for(var i=0;i<strs.length;i++)
	{
		if (strs[i].length < 2) continue;
		var arr = '';
		var dirs = strs[i].split(':');
		if(dirs.length==3)
		{
			idss = dirs[2];
		}
		else
			idss = dirs[0];

		dirs[1] = ansistr(dirs[1]);
		var dddd = '<button style="color:'+textcol+';width:95%;height:95%" type="button" id="'+idss+'" onclick="cmds(this)">' + dirs[1]+ '</button>';
		if(dirs[0]=='east'||dirs[0]=='eastup'||dirs[0]=='eastdown')
		{
			dire = dddd;
		}
		else if(dirs[0]=='west'||dirs[0]=='westup'||dirs[0]=='westdown')
		{
			dirw = dddd;
		}
		else if(dirs[0]=='north'||dirs[0]=='northup'||dirs[0]=='northdown')
		{
			dirn = dddd;
		}
		else if(dirs[0]=='south'||dirs[0]=='southup'||dirs[0]=='southdown')
		{
			dirso = dddd;
		}
		else if(dirs[0]=='southwest')
		{
			dirsw = dddd;
		}
		else if(dirs[0]=='southeast')
		{
			dirse = dddd;
		}
		else if(dirs[0]=='northwest')
		{
			dirnw = dddd;
		}
		else if(dirs[0]=='northeast')
		{
			dirne = dddd;
		}
		else
		{
			arr = "act";
		}
		if(arr=="act")
		{
			actsob.append('<button style="color:'+textcol+';width:95%;height:30px" id="'+idss+'" onclick="cmds(this)">' + dirs[1]+ '</button>');
			adjustLayout();
		}
		else
		{
			writedirs();
		}
	}
};

function writeToACT(str) {
	var r = 3,w = 3,h = 10,s = 30;
	var rs = str.match(/^\$.*?\#/);
	var ss = null;
	if(rs!=null)
	{
		ss = rs[0].split(/[\$,\#]/);
		if(ss!=null)
		{
			r = parseInt(ss[1]);
			if(r==1)
				r=4;
			w = parseInt(ss[2]);
			h = parseInt(ss[3]);
			s = parseInt(ss[4]);
		}
		str = str.replace(rs[0],'');
	}
	var strs = str.split("$zj#");
	for(var i=0;i<(strs.length/r+1);i++)
	{
		for(var j=0;j<r;j++)
		{
			if((i*r+j)>(strs.length-1)) break;
			var dirs = strs[i*r+j].split(':');
			if(dirs.length<2) continue;
			var hi = scrh/(2*h)+5;
			var wi = 97/w;
			dirs[0] = dirs[0].replace(/\$br\#/g ,"<br>");
			dirs[0] = ansistr(dirs[0]);
			hudongob.append('<button style="text-align:left;margin-top:3px;padding-left:5px;font-size:10px;color:'+textcol+';width:'+wi+'%;height:'+hi+'px;" type="button" id="'+dirs[1]+'" onclick="cmdsc(this)">' + dirs[0]+ '</button>');
		}
	}
	hudongob.css('height','auto');
	if(hudongob.height()>($(window).height()-150-longob.height()-hpsob.height()-tbarob.height()))
	{
		hudongob.height($(window).height()-150-longob.height()-hpsob.height()-tbarob.height());
	}
};

function writeToHP(str) {
	var r = 5,w = 5,h = 25,s = 33;
	hpsob.html('');
	var rs = str.match(/^\$.*?\#/);
	var ss = null;
	if(rs!=null)
	{
		ss = rs[0].split(/[\$,\#]/);
		if(ss!=null)
		{
			r = parseInt(ss[1]);
			w = parseInt(ss[2]);
			h = parseInt(ss[3]);
			s = parseInt(ss[4]);
		}
		str = str.replace(rs[0],'');
	}
	var strs = str.split("║");
	var wid = scrw/w-w, hig = scrh/h;
	var ssss = '';
	var ssss = '<table width="100%" border="1" cellspacing="0" cellpadding="0">';
	for(var i=0;i<(strs.length/r+1);i++)
	{
		ssss += '<tr>';
		for(var j=0;j<r;j++)
		{
			if((i*r+j)>(strs.length-1)) break;
			var dirs = strs[i*r+j].split(':');
			var hi = scrh/(2*h);
			var wi = 100/w;
			dirs[0] = dirs[0].replace("$br#", "\n");
			if(dirs.length>2)
			{
				if(dirs[2].length==9)
					dirs[2]='#'+dirs[2].substr(3);
				sss = dirs[1].split("/");
				if(sss.length==3)
				{
					var wwii = sss[0]*99/sss[1];
					if(wwii>100) wwii = 100;
					var wwi = sss[1]*99/sss[2];
					if(wwi>100) wwi = 100;
					ssss += '<td width="'+wi+'%" style="background-color:#444;height:'+hi+'px">'+
								'<div style="width:'+wwi+'%;background-color:#999;height:100%">'+
									'<div class="hpbt" style="background-color:'+dirs[2]+';width:'+wwii+'%;height:100%">'+
										'<input class="hpbt" style="width:'+($(window).width()/w-3)+'px;height:100%" type="button" value="' + dirs[0]+ '">'+
									'</div>'+
								'</div>'+
							'</td>';
				}
				else if(sss.length==2)
				{
					var wii = sss[0]*99/sss[1];
					if(wii>99) wii = 99;
					ssss += '<td width="'+wi+'%" style="background-color:#999;height:'+hi+'px">'+
								'<div class="hpbt" style="background-color:'+dirs[2]+';width:'+wii+'%;height:100%">'+
									'<input class="hpbt" style="width:'+($(window).width()/w-3)+'px;height:100%" type="button" value="' + dirs[0]+ '">'+
								'</div>'+
							'</td>';
				}
				else
				{
					ssss += '<td width="'+wi+'%" style="background-color:#999">'+
								'<div class="hpbt" style="background-color:'+dirs[2]+';width:99%;height:'+hi+'px;">'+
									'<input class="hpbt" style="width:'+($(window).width()/w-3)+'px;height:'+hi+'px;" type="button" value="' + dirs[0]+ '">'+
								'</div>'+
							'</td>';
				}
			}
			else
			{
				ssss += '<input class="hpbt" style="width:'+wi+'%;height:'+hi+'px;" type="button" value="' + dirs[0]+ '" />';
			}
		}
		ssss += '</tr>';
	}
	ssss += '</table>';

	hpsob.html(ssss);
	if(hpsob.is(':hidden'))
	{
		hpsob.show();
		adjustLayout();
	}
};

function writeToPop(str) {
	var r = 2,w = 2,h = 9,s = 30;
	hudongob.html('');
	dialog_title = dialog_title.replace('<br>','');		
	hudongob.dialog({
		title:dialog_title,
		modal:true,
		width:scrw*11/12,
		position:["center",72],
		buttons: {
		}
	});
	var rs = str.match(/^\$.*?\#/);
	var ss = null;
	if(rs!=null)
	{
		ss = rs[0].split(/[\$,\#]/);
		if(ss!=null)
		{
			r = parseInt(ss[1]);
			w = parseInt(ss[2]);
			h = parseInt(ss[3]);
			s = parseInt(ss[4]);
		}
		str = str.replace(rs[0],'');
	}
	var strs = str.split("$z2#");
	for(var i=0;i<(strs.length/r+1);i++)
	{
		for(var j=0;j<r;j++)
		{
			if((i*r+j)>(strs.length-1)) break;
			var dirs = strs[i*r+j].split('|');
			if(dirs.length<2) continue;
			var hi = $(window).height()/(2*h)+5;
			var wi = 100/w-1;
			dirs[0] = dirs[0].replace("$br#", "<br>");
			dirs[0] = ansistr(dirs[0]);
			hudongob.append('<button style="font-size:10px;color:'+textcol+';width:'+wi+'%;height:'+hi+'px;" type="button" id="'+dirs[1]+'" onclick="cmdsa(this)">' + dirs[0]+ '</button>');
		}
	}
	hudongob.css('height','auto');
	if(hudongob.height()>($(window).height()-150-longob.height()-hpsob.height()-tbarob.height()))
	{
		hudongob.height($(window).height()-150-longob.height()-hpsob.height()-tbarob.height());
	}
};

function close_hd()
{
	$('#mycmds').hide();
	$('#hudong').close();
	$('#map').close();
};

function writeToHD(str) {
	hudongob.html('');
	dialog_title = dialog_title.replace('<br>','');		
	hudongob.dialog({
		title:dialog_title,
		modal:true,
		width:scrw*11/12,
		position:["center",72],
		buttons: {
		}
	});

	var strs = str.split("$br#");

	for(var i=0;i<strs.length;i++)
	{
		if(strs[i].substr(0,15)=='一一一一一一一一一一一一一一一')
		{
			strs[i] = '<hr>';
		}
		strs[i] = ansistr(strs[i]);
		hudongob.append('<span class="out">'+ strs[i]+ '</span>');
		if(i<(strs.length-1) && strs[i] != '<hr>') hudongob.append('<br>');
	}
	hudongob.css('height','auto');
	if(hudongob.height()>($(window).height()-100-longob.height()-hpsob.height()-tbarob.height()))
	{
		hudongob.height($(window).height()-100-longob.height()-hpsob.height()-tbarob.height());
	}
};

function writeToMAP(str) {
	var out = $('div#map');
	out.html('');
	dialog_title = dialog_title.replace('<br>','');		
	out.dialog({
		title:dialog_title,
		modal:true,
		width:scrw*11/12,
		position:["center",72],
		buttons: {
		}
	});

	var strs = str.split("$br#");

	for(var i=0;i<strs.length;i++)
	{
		strs[i] = ansistr(strs[i]);
		out.append('<span class="map">'+ strs[i]+ '</span>');
		if(i<(strs.length-1)) out.append('<br>');
	}
	// 地图是等宽字符拼的整幅图，横向被裁掉就看不全了。
	// 宽度不够时按比例把字号缩小一点，让整张图完整放进来；缩到下限还超才允许横向滚动。
	(function fitMapWidth() {
		var el = $('div#map')[0];
		if (!el) return;
		var base = 8;               // 原始字号
		var minFont = 5;            // 再小就糊了，保留横向滚动
		// span.map 在 CSS 里自带 8px 字号，只改容器的字号对子元素无效，
		// 必须把字号直接压到每个 span 上。
		var spans = el.querySelectorAll('span.map');
		var setFont = function (px) {
			el.style.fontSize = px + 'px';
			for (var i = 0; i < spans.length; i++) spans[i].style.fontSize = px + 'px';
		};
		setFont(base);
		var guard = 0;
		while (el.scrollWidth > el.clientWidth + 1 && base > minFont && guard++ < 12) {
			base = base - 0.5;
			setFont(base);
		}
	})();

	// 让地图按内容自然撑开；只有真的超过可用高度时才限高并允许滚动。
	// 这里必须减掉对话框自身占的地方（距顶部 72px + 标题栏 + 内边距 + 底部余量），
	// 否则算出来的高度偏大，内容边缘会多出几个像素，产生那条“只有一点点”的滚动条。
	$('div#map').css('height','auto');
	var dlg = $('div#map').closest('.ui-dialog');
	var chromeH = 0;
	if (dlg.length) {
		var content = $('div#map')[0];
		var cs = window.getComputedStyle(content);
		var padY = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
		var titleH = dlg.find('.ui-dialog-titlebar').outerHeight(true) || 0;
		chromeH = titleH + padY + 72 + 16; // 72 是 position 的 top，16 留一点呼吸空间
	} else {
		chromeH = 100;
	}
	var avail = $(window).height() - longob.height() - hpsob.height() - chromeH;
	if ($('div#map')[0].scrollHeight > avail) {
		$('div#map').height(avail);
	}
};

function writeToOBJ(str) {
	var strs = str.split("$zj#");
	for(var i=0;i<strs.length;i++)
	{
		if (strs[i].length < 2) continue;
		var dirs = strs[i].split(':');
		dirs[0] = ansistr(dirs[0]);
		objob.append('<div style="color:'+textcol+';margin-top:3px;width:100%" id="obj_'+dirs[1]+'">'
						+'<div style="width:0%;height:2px;margin-left:2px;background-color:#777" id="hp_'+dirs[1]+'">'
							+'<div style="width:100%;height:2px;background-color:#a00" id="qi_'+dirs[1]+'"></div></div>'
						+'<button style="color:'+textcol+';width:95%;height:30px" id="'+dirs[1]+'" onclick="cmds(this)">'+ dirs[0]+ '</button>'
						+'</div>');
	}
};

function writeToBar(str) {
	var strs = str.split("$zj#");
	tmenuob.html('');
	for(var i=0;i<strs.length;i++)
	{
		var dirs = strs[i].split(':');
		dirs[0] = ansistr(dirs[0]);
		tmenuob.append('<button style="color:'+textcol+';margin:0px 2px;float:right;width:50px;height:23px" id="'+dirs[1]+'" onclick="cmds(this)">'+ dirs[0]+ '</button>');
	}
};

function updateQi(str) {
	var strs = str.split("$zj#");
	var qis = strs[1].split(":");

	var hpd = document.getElementById('hp_'+htmlDecode(strs[0]));
	if(!hpd)
	{
		strs[0] = strs[0]+'\n';		
		hpd = document.getElementById('hp_'+htmlDecode(strs[0]));
	}

	if (!hpd)
		return;
		
	hpd.style.width = (parseInt(qis[1])*94/parseInt(qis[2])).toString()+"%";
	var qid = document.getElementById('qi_'+htmlDecode(strs[0]));
	if(!qid)
	{
		strs[0] = strs[0]+'\n';		
		qid = document.getElementById('qi_'+htmlDecode(strs[0]));
	}
	if (!qid)
		return;
	qid.style.width = (parseInt(qis[0])*100/parseInt(qis[1])).toString()+"%";
};

function removeEXIT(str) {
	var ob = document.getElementById(htmlDecode(str));
	if(!ob)
	{
		str = str.replace('\n','');		
		str = str.replace('\r','');		
		ob = document.getElementById(htmlDecode(str));
	}
	if(ob)
		ob.remove();
};

function removeOBJ(str) {
	var ob = document.getElementById('obj_'+htmlDecode(str));
	if(!ob)
	{
		str = str.replace('\n','');		
		str = str.replace('\r','');		
		ob = document.getElementById('obj_'+htmlDecode(str));
	}
	if(ob)
		ob.remove();
};

function writeToCHAT(str) {
	//str = str.replace(/\【/, '[ ');
	//str = str.replace(/\】/, ' ] ');
	str = ansistr(str);
	chatob.append('<span class="chat">' + str + '</span><br>');
	chatob.scrollTop(chatob.prop("scrollHeight"));
};

function writeToLO(str) {
	//str = str.replace(/\【/, '[ ');
	//str = str.replace(/\】/, ' ]');
	longob.append('<span class="long">' + ansistr(str) + '</span>');
	adjustLayout();
};

function zjBottomBT(str) {
	// the client builds the same bottom menu itself after 0000007
}

function close_mycmds()
{
	mycmdsob.hide();
};

function userBT()
{
	mycmdsob.show();
	mycmdsob.html('');
	var w = (mycmdsob.width()-25)/6;
	for(var i=1;i<11;i++)
	{
		if(zjStore.getItem("mybt"+i))
		{
			var str = zjStore.getItem("mybt"+i).split(',');
			mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button" id="'+str[1]+'" onclick="cmdsa(this)">' + str[0]+ '</button>');
		}
		else
		{
			mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button">***</button>');
		}
	}
	mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button" onclick="initBT()">快捷<br>设定</button>');
	mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button" onclick="close_mycmds()">关闭<br>选项</button>');
}

function initBT()
{
	writeToHD('请选择你要设定的按钮：\n');
	for(var i=1;i<11;i++)
	{
		hudongob.append('<button style="color:'+textcol+';width:19%;height:30px;" type="button" id="mybt'+i+'" onclick="setBT('+i+')">自定' + i + '</button>');
	}
}

function setBT(sn)
{
	writeToHD('请输入你要对【按钮'+sn+'】的定义：\n[ 按钮名字,要执行的指令 ]\n');
	mycmdsob.hide();
	hudongob.append('<textarea style="background-color:rgba(200,200,200,0.1);color:'+textcol+';width:95%;height:22px;font-size:16px;padding:6px" id="chatmsg"></textarea>');
	if(zjStore.getItem('mybt'+sn))
		$('textarea#chatmsg').val(zjStore.getItem('mybt'+sn));
	hudongob.append('<br><button style="color:'+textcol+';width:'+(97/3)+'%;height:'+(scrh/18+5)+'px;" onclick="setBTOK('+sn+')">确定</button>');
	hudongob.append('<button style="color:'+textcol+';width:'+(97/3)+'%;height:'+(scrh/18+5)+'px;" onclick="close_hd()">取消</button>');
}

function setBTOK(sn)
{
	if($('textarea#chatmsg').val()=='')
	{
		alert("请输入定义内容！");
		return;
	}
	var str = $('textarea#chatmsg').val();
	var ss = str.split(',');
	if(ss.length!=2)
	{
		alert("格式错误！请输入：名称和需要执行的指令，中间用英文逗号隔开。");
		return;
	}
	zjStore.setItem('mybt'+sn,str);
	$('textarea#chatmsg').val('');
	close_hd();
	writeToScreen('按钮'+sn+'自定义完毕。\n');
}

function writeToMU(str) {
	// the top-level menu (常用/技能/... -> mycmds ofen etc.) configures the bottom bar;
	// they are not a popup menu, so don't open the panel over the room.
	if (str.indexOf(':mycmds ofen') >= 0) { zjBottomBT(str); return; }
	mycmdsob.show();
	var strs = str.split("$zj#");
	mycmdsob.html('');
	var w = (mycmdsob.width()-25)/6;
	for(var i=0;i<strs.length;i++)
	{
		if (strs[i].length < 2) continue;
		var dirs = strs[i].split(':');
		if(dirs[1]=='***'||dirs[1]=='暂未设定') continue;
		dirs[1] = ansistr(dirs[1]);
		dirs[1] = dirs[1].replace("\n", '<br>');
		mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button" id="'+dirs[2]+'" onclick="cmdsa(this)">' + dirs[1]+ '</button>');
	}
	mycmdsob.append('<button style="color:'+textcol+';margin:2px;width:'+w+'px;height:42px;" type="button" onclick="close_mycmds()">关闭<br>选项</button>');
};

function writeToScreen(str) {
	//str = str.replace(/\【/, '[ ');
	//str = str.replace(/\】/, ' ]');
	str = ansistr(str);
	// 手机上屏幕小、一屏放不下几行，往上翻看战斗记录时新消息会把视图拽回底部。
	// 只有本来就在底部（或快到底部）时才自动跟随。
	var follow = isScrolledToBottom(outob);
	outob.append('<span class="out">' + str + '</span>');
	var node = document.getElementById("out"); 
	if(node.hasChildNodes())
	{
		// 保留更多行：手机一屏就十几行，50 条翻两下就没了。
		var childList = node.childNodes;
		while (childList.length > 400) node.removeChild(childList[0]);
	}
	if (follow) outob.scrollTop(outob.prop("scrollHeight"));
};

// 是否已经贴在底部（留 40px 容差，避免亚像素误差导致永远判定为“不在底部”）
function isScrolledToBottom(ob) {
	if (!ob || !ob.length) return true;
	var el = ob[0];
	return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
};

function writelogin() {
	outob.html('');
	hudongob.html('');
	
	hudongob.dialog({
		title:"欢迎进入"+titled+"！",
		modal:true,
		width:scrw*11/12,
		position:["center",72],
		buttons: {/*
			"登录游戏": function() {
				logincheck();
			},
			"注册账号": function() {
				writeregister();
			},*/
		}
	});
	chatob.html('');
	chatob.append('<span class="out">欢迎进入'+GetStr("server")+'......</span><br>');
	hudongob.append('<span class="out">请输入账号：</span><br>');
	hudongob.append('<span class="out"><input type="text" value="'+getCookie('myid')+'" id="id"></span><br>');
	hudongob.append('<span class="out">请输入密码：<br></span>');
	hudongob.append('<span class="out"><input type="password" value="'+getCookie('mypass')+'" id="pass"></span><br><br>');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="exit_login" value="登录游戏" onclick="logincheck()" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="exit_login" value="注册账号" onclick="writeregister()" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="exit_login" value="换游戏" onclick="main_login()" />');
};

function writechar() {
	hudongob.html('');
	hudongob.dialog({
		title:"请建立游戏角色！",
		modal:true,
		position:["center",72],
		buttons: {
			"确认建立": function() {
				charcheck();
			},
		}
	});
	hudongob.append('<span class="out">请输入昵称：</span><br>');
	hudongob.append('<span class="out"><input type="text" id="nicheng"></span><br>');
	hudongob.append('<span class="out">请选择性别：</span><br>');
	hudongob.append('<form><input type="radio" style="width:50px;height:10px" name="sex" value="男性" id="nan"><span style="width:90px;height:20px;line-height:0px" class="out">男性　</span><input type="radio" style="width:50px;height:10px" name="sex" value="女性" id="nv"><span style="width:90px;height:20px;line-height:0px" class="out">女性　</span></form><br>');
};

function addZero(str,length) {
	var strlen = str.length;
	if (strlen >= length) 
		return str;
	else 
		return new Array(length - strlen + 1).join("0") + str;              
}

function getDateYMD() {
	var date = new Date()
	return (date.getFullYear() + "-" + addZero(String((date.getMonth() + 1)), 2) + "-" + addZero(String(date.getDate()), 2));
}

function logincheck(id,pass) {
	var myid,mypass,mycs,key,mymail;
	mycs = "login";
	
	if(id!=null)
		myid = id;
	else
	{
		myid = $('input#id').val();
	}
	if(pass!=null)
	{
		mypass = pass;
	}
	else
	{
		mypass = $('input#pass').val();
	}
	if(myid==''||mypass=='')
	{
		alert('账号密码不能为空！');
		return;
	}

	mycmdsob.css('background','#333');
	$('body').css('background-size',$(window).width()+'px '+$(window).height()+'px');
	ansi_flag = true;
	hudongob.html('');
	chatob.html('');
	setCookie('myid',myid);
	setCookie('mypass',mypass);
	zjStore.setItem('myid',myid);
	zjStore.setItem('mypass',mypass);
	zjStore.setItem('auto_login',true);
	sock.emit('stream',myid+'║'+mypass+'║'+user_key+'║'+(mymail||'none@local')+'\n');
	try { hudongob.dialog("close"); } catch (e) {}
};

function writeregister() {	
	hudongob.dialog({
		title:tit+"账号注册：",
		modal:true,
		position:["center",72],
		buttons: {
		}
	});
	
	outob.html('');
	hudongob.html('');
	
	hudongob.append('<span class="out">请输入账号(4-12位)：</span><br>');
	hudongob.append('<span class="out"><input type="text" value="" id="id"></span><br>');
	hudongob.append('<span class="out">请输入密码：</span><br>');
	hudongob.append('<span class="out"><input type="password" value="" id="pass"></span><br>');
	hudongob.append('<span class="out">重新输入密码：</span><br>');
	hudongob.append('<span class="out"><input type="password" value="" id="repass"></span><br>');
	hudongob.append('<span class="out">请输入邮箱(可不填)：</span><br>');
	hudongob.append('<span class="out"><input type="text" value="" id="mail"></span><br>');
		
	hudongob.append('<br><span id="uiButton" style="display:flex;justify-content:space-between;width:100%;">'
		+ '<span class="out left"><button type="button" style="color:'+textcol+';margin:1px;width:80px;height:35px" id="register" onclick="registercheck()">确定提交</button></span>'
		+ '<span class="out right"><button type="button" style="color:'+textcol+';width:80px;height:35px" id="back" onclick="writelogin()">返   回</button></span>'
		+ '</span>');		
}

function registercheck() {
	var myid,mypass,myrepass,myphone,mymail,mycs;
	mycs = 'reg';
	myid = $('input#id').val();
	mypass = $('input#pass').val();
	myrepass = $('input#repass').val();
	myphone = $('input#phone').val();
	mymail = $('input#mail').val();
	
	if(myid==''||mypass=='')
	{
		alert('账号密码不能为空！');
		return;
	}
	if(mypass!=myrepass)
	{
		alert('两次密码输入不一致！');
		return;
	}
	if(mymail=='') mymail='none@local';
	hudongob.html('');
	hudongob.html('注册中...<br>');

	setCookie('myid',myid);
	setCookie('mypass',mypass);
	zjStore.setItem('myid',myid);
	zjStore.setItem('mypass',mypass);
	zjStore.setItem('auto_login',true);
	regtoken = myid+'║'+mypass+'║'+ user_key +'║'+mymail+'\n';
	sock.emit('stream', regtoken);
	hudongob.dialog("close");
}

function charcheck() {
	var myname = $('input#nicheng');
	var mysex = $("input[name='sex']:checked");
	if(myname.val()=='')
	{
		alert('昵称不能为空！');
		return;
	}
	if(mysex.val()!="男性"&&mysex.val()!="女性")
	{
		alert('请选择性别！');
		return;
	}
	hudongob.html('');
	chatob.html('角色创建中......<br>');

	sock.emit('stream',mysex.val()+'║001║'+myname.val()+'\n');
	hudongob.dialog("close");
};

function relogin()
{
	sock.emit('stream','quit\n');
	delCookie('auto_login');
	zjStore.removeItem('auto_login'); // back to the login box; id/password stay filled in
	setTimeout(function(){ location.reload(); }, 800);
};

function filepath(obj)  
{  
	if(obj)  
	{
		if (window.navigator.userAgent.indexOf("MSIE")>=1)  
		{  
			obj.select();
			return document.selection.createRange().text;  
		}
		else if(window.navigator.userAgent.indexOf("Firefox")>=1)  
		{  
			if(obj.files)  
			{
				return obj.files.item(0).getAsDataURL();  
			}  
			return obj.value;  
		}  
		return obj.value;  
	}  
}  

function fordaymod()
{
	$('body').css('background','#eee');
	$('body').css('color','#666');
	textcol = '#666';
	ansi_flag = false;
	hudongob.css('background','#eee');
	mycmdsob.css('background','#eee');
	$('div#map').css('background','#eee');
};

function fornightmod()
{
	$('body').css('background','#000');
	$('body').css('color','#ddd');
	textcol = '#ddd';
	ansi_flag = true;
	hudongob.css('background','#333');
	mycmdsob.css('background','#000');
	$('div#map').css('background','#333');
};

function foransitext()
{
	if(ansi_flag)
		ansi_flag = false;
	else
		ansi_flag = true;
};

function paym()
{
	
	close_hd();
}
function main_login()
{
	location.href = "../";
	close_hd();
}
function room_set()
{
	if (!longob.is(":hidden")) { //如果场景描述为打开状态
		longob.height(0);
		longob.hide();
		$('input#toggleBtn').attr('value', '场景(关)');
	} else {
		longob.show();
		longob.height('auto');
		$('input#toggleBtn').attr('value', '场景(开)');
	}
	adjustLayout();
}
function toggleChat() {	
	if (chatob.height() < 100) {
		chatob.height(140);
		chat_height = 100;
		$('input#toggleChatBtn').attr('value', '聊天(宽)');
	} else {
		chatob.height('auto');
		chat_height = 0;
		$('input#toggleChatBtn').attr('value', '聊天(窄)');
	}
	adjustLayout();
}

function config()
{
	var long_value, chat_value;
	hudongob.html('');
	hudongob.dialog({
		title:"系统菜单",
		modal:true,
		width:scrw*11/12,
		position:["center",72],
		buttons: {
		}
	});
	if (!longob.is(":hidden")) {
		long_value = '场景(开)';
	} else  {
		long_value = '场景(关)';
	}
	if (chatob.height() < 100) {
		$('input#toggleChatBtn').attr('value', '聊天(窄)');
		chat_value = '聊天(窄)';
	} else {
		$('input#toggleChatBtn').attr('value', '聊天(宽)');
		chat_value = '聊天(宽)';
	}
	
	hudongob.append('<br>');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="jinshouzhi" value="金手指" onclick="cmdsa(this)" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="autoquest" value="自动师门" onclick="cmdsa(this)" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="autotrain" value="自动修炼" onclick="cmdsa(this)" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="exit_login" value="换游戏" onclick="main_login()" /><br>');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="toggleBtn" value='+long_value+' onclick="room_set()" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="toggleChatBtn" value='+chat_value+' onclick="toggleChat()" />');
	hudongob.append('<input type="button" style="color:'+textcol+';margin:3px;width:80px;height:35px" id="exit_login" value="退出游戏" onclick="relogin()" />');
	hudongob.css('height','auto');
	if(outob.height()>($(window).height()-150-longob.height()))
		outob.height($(window).height()-150-longob.height());
};

function writeInput(line) {
	var ss = line.split("$zj#");
	ss[0] = ss[0].replace("$br#",'\n');
	writeToHD(ss[0]);
	hudongob.append('<textarea style="background-color:rgba(200,200,200,0.1);color:'+textcol+';width:96%;height:22px;font-size:16px;padding:6px" id="chatmsg"></textarea>');
	/*
	if(dialog_title=='指令')
		hudongob.append('<button style="color:'+textcol+';width:'+(96/4)+'%;height:'+(scrh/18+6)+'px;" id="'+ss[1]+'" onclick="cmdsb()">确定</button>');
	else*/
		hudongob.append('<br><button style="color:'+textcol+';width:'+(96/4)+'%;height:'+(scrh/18+6)+'px;" id="'+ss[1]+'" onclick="says(this)">确定</button>');
}
// 手机上没有回车键，但外接键盘、iPad、以及部分输入法的“换行/前往”键都会触发 Enter。
// 直接发送，省掉再点“执行”一次。Shift+Enter 留给换行。
// 对话框里的确定按钮决定走哪条路（says 带 $txt# 前缀，cmdsb 是普通指令），
// 所以直接找到那个按钮并调用它自己的 onclick，不重复实现发送逻辑。
function submitCommandBox() {
	var btn = $('#hudong button').filter(function () {
		var oc = this.getAttribute('onclick') || '';
		return oc.indexOf('says(') >= 0 || oc.indexOf('cmdsb(') >= 0;
	}).get(0);
	if (btn) { btn.onclick(); return true; }
	if (typeof cmdsb === 'function') { cmdsb(); return true; }
	return false;
}

$(document).on('keydown', 'textarea#chatmsg', function (e) {
	if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return;
	e.preventDefault();
	submitCommandBox();
});

// 指令历史：手机输入慢，重复的指令（look、score、hp…）不该每次手打。
// 上下方向键在物理键盘上翻历史。
var cmdHistory = [], cmdHistIdx = -1;
function pushCmdHistory(v) {
	v = String(v || '').trim();
	if (!v) return;
	if (cmdHistory[cmdHistory.length - 1] === v) { cmdHistIdx = -1; return; }
	cmdHistory.push(v);
	if (cmdHistory.length > 60) cmdHistory.shift();
	cmdHistIdx = -1;
	try { zjStore.setItem('cmdhist', JSON.stringify(cmdHistory)); } catch (e) {}
}
try {
	var saved = zjStore.getItem('cmdhist');
	if (saved) cmdHistory = JSON.parse(saved) || [];
} catch (e) { cmdHistory = []; }

$(document).on('keydown', 'textarea#chatmsg', function (e) {
	if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
	if (!cmdHistory.length) return;
	e.preventDefault();
	if (e.key === 'ArrowUp') {
		if (cmdHistIdx < 0) cmdHistIdx = cmdHistory.length - 1; else if (cmdHistIdx > 0) cmdHistIdx--;
	} else {
		if (cmdHistIdx >= 0 && cmdHistIdx < cmdHistory.length - 1) cmdHistIdx++;
		else { cmdHistIdx = -1; $(this).val(''); return; }
	}
	$(this).val(cmdHistory[cmdHistIdx]);
});

function writecmd() {
	dialog_title = "执行指令";
	writeToHD('请输入指令：');

	hudongob.append('<textarea style="background-color:rgba(200,200,200,0.1);color:'+textcol+';width:96%;height:22px;font-size:16px;padding:6px" id="chatmsg" ></textarea>');
	hudongob.append('<button style="color:'+textcol+';width:'+(96/4)+'%;height:'+(scrh/18+6)+'px;" id="chatmsg" onclick="cmdsb()" value="执行指令">执行</button>');
}

function writeServerData(buf) {
	var line = buf;
	// strip ANSI colour codes that precede a protocol code (e.g. NOR after \n)
	line = line.replace(/^(?:\x1b\[[0-9;]*m)+(?=\x1b\d{3})/, '');
	
		if(line.length<4) return;

		if(line.substr(0,6)=='版本验证成功')
		{
			if(zjStore.getItem('myid')&&zjStore.getItem('mypass')&&zjStore.getItem('auto_login'))
			{
				logincheck(zjStore.getItem('myid'),zjStore.getItem('mypass'));
			}
			else
			{
				writelogin();
			}
			return;
		}

		if(line.substr(0,8)=='0000008')
		{
			writechar();
			return;
		}
		if(line.substr(0,8)=='0000007')
		{
			loginok = true;
			//longob.show();
			//默认关闭场景描述
			longob.height(0);
			longob.hide();
			chatob.height(140);
			chat_height = 100;
			
			outob.html('');
			outob.show();
			leftob.show();
			exitsob.show();
			menuob.html('<table width="100%" border="0" cellspacing="0" cellpadding="1"><tr>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b10" id="look" onclick="javascript:writecmd()" value="指令"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b12" id="mycmds ofen" onclick="javascript:cmdsa(this)" value="常用"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b14" id="mycmds skill" onclick="javascript:cmdsa(this)" value="技能"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b13" id="mycmds fight" onclick="javascript:cmdsa(this)" value="战斗"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b15" id="mycmds quest" onclick="javascript:cmdsa(this)" value="任务"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b17" id="mycmds help" onclick="javascript:cmdsa(this)" value="帮助"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b16" id="liaotian" onclick="javascript:cmdsa(this)" value="聊天"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="b11" id="look" onclick="javascript:config()" value="系统"></td>'
				+'<td align="center" valign="middle"><input class="menubt" type="button" name="bcmd" id="cmd" onclick="javascript:userBT()" value="自定"></td></tr>'
				+'</table>');
			adjustLayout();
			return;
		}

		if(!loginok)
		{
			if(line.substr(0,4)=='015'&&line.substr(4,4)!='登录成功')//弹出提示（登录成功不算错误）
			{
				alert(line.substr(4));
				zjStore.removeItem('auto_login');
				writelogin();
			}
			return;
		}
		if(line.substr(0,15)=='一一一一一一一一一一一一一一一'||line.substr(0,8)=='line_msg')
		{
			line = '<hr>';
		}
		if(line.substr(0,4)=='100')//频道信息
		{
			writeToCHAT(line.substr(4));
		}
		else if(line.substr(0,4)=='001')//输入框
		{
			writeInput(line.substr(4));
		}
		else if(line.substr(0,4)=='002')
		{
			writeToST(line.substr(4));
		}
		else if(line.substr(0,4)=='003')
		{
			writeToEX(line.substr(4));
		}
		else if(line.substr(0,4)=='903')
		{
			removeEXIT(line.substr(4));
		}
		else if(line.substr(0,4)=='006')
		{
			line = line.replace(/\$br\#/g,'\n');
			writeToMU(line.substr(4));
		}
		else if(line.substr(0,4)=='004')
		{
			writeToLO(line.substr(4));
		}
		else if(line.substr(0,4)=='005')
		{
			writeToOBJ(line.substr(4));
		}
		else if(line.substr(0,4)=='905')
		{
			removeOBJ(line.substr(4));
		}
		else if(line.substr(0,4)=='007')
		{
			writeToHD(line.substr(4));
		}
		else if(line.substr(0,4)=='008'||line.substr(0,4)=='009')
		{
			writeToACT(line.substr(4));
		}
		else if(line.substr(0,4)=='011')
		{
			writeToMAP(line.substr(4));
		}
		else if(line.substr(0,4)=='012')
		{
			writeToHP(line.substr(4));
		}
		else if(line.substr(0,4)=='014')
		{
			sock.emit('stream',line.substr(4)+'\n');
		}
		else if(line.substr(0,4)=='015')
		{
			writeToScreen(line.substr(4));
		}
		else if(line.substr(0,4)=='020')
		{
			writeToPop(line.substr(4));
		}
		else if(line.substr(0,4)=='021')
		{
			writeToBar(line.substr(4));
		}
		else if(line.substr(0,4)=='022')
		{
			updateQi(line.substr(4));
		}
		else
		{
			writeToScreen(line);
		}
	// 聊天气泡、弹窗、方向格都会改变下面那几块的高度，每来一行就排一次（内部有 120ms 合并）
	scheduleRelayout();
};

function adjustLayout() {
	if(!loginok) return;

	refreshViewport();
	// 按实测高度排：底部固定浮着气血条和菜单两块，右边一列是「日志区 + 方向格」。
	// 以前用常数 196 估算，聊天区一变形（或方向格换行变高）日志区就多出几十像素，
	// 把方向格挤出屏幕（手机上就是「最下面那排被切掉」）。现在全部按实测算。
	var safeB = 0;
	try { safeB = parseFloat($(document.body).css('padding-bottom')) || 0; } catch (e) { }
	var avail = scrh - safeB;
	var below = (hpsob.outerHeight() || 36) + (menuob.outerHeight() || 38) + 6;
	var colTop = rightob.position().top + (parseFloat(rightob.css('margin-top')) || 0);
	var colH = Math.max(200, avail - colTop - below);
	var exitsH = exitsob.outerHeight(true) || 96;

	// 每来一行都会排一次，数值没变就别动样式（写样式才会触发重排）
	var gridTop = exitsob.offset().top;
	var panelBottom = Math.round(Math.max(120, scrh - safeB - gridTop) + 6);
	var sig = colH + '/' + panelBottom;
	if (sig === lastLayoutSig) return;
	lastLayoutSig = sig;

	rightob.height(colH);
	outob.css('height', ''); // 高度交给 flex 算：日志区吃掉方向格之外的空间
	leftob.height(colH);
	objob.css('height', '');
	// 快捷指令面板（常用/技能/系统）浮在方向格上面，不能压住九宫格。
	mycmdsob.css("bottom", panelBottom);
};

// 横竖屏切换、地址栏伸缩时窗口尺寸会变；手机上软键盘弹出时 visualViewport 也会变。
// 用短延时合并连续触发，避免拖动窗口时每一帧都重排。
var relayoutTimer = null;
function scheduleRelayout() {
	if (relayoutTimer) clearTimeout(relayoutTimer);
	relayoutTimer = setTimeout(function () {
		relayoutTimer = null;
		adjustLayout();
		// 方向格/聊天区刚换过行时第一次量到的是旧高度，隔一帧再排一次让位置落定
		setTimeout(adjustLayout, 220);
	}, 120);
}

$(window).resize(scheduleRelayout);
$(window).on('orientationchange', scheduleRelayout);
if (window.visualViewport) {
	window.visualViewport.addEventListener('resize', scheduleRelayout);
}

$(document).ready(function(){
	// tap the grey backdrop to close the top dialog (after login only; keep half-typed input)
	$(document).on('click touchend', '.ui-widget-overlay', function(e){
		if(!loginok) return;
		var dlg = $('.ui-dialog:visible').last();
		if(!dlg.length) return;
		var typed = false;
		dlg.find('textarea,input[type=text]').each(function(){ if($.trim($(this).val())!='') typed = true; });
		if(typed) return;
		e.preventDefault();
		dlg.find('.ui-dialog-content').dialog('close');
	});
	document.title = titled;
	longob.hide();
	hudongob.hide();
	$('div#map').hide();
	outob.hide();
	exitsob.hide();
	leftob.hide();
	hpsob.hide();
	mycmdsob.hide();

	sock.on('stream', function(buf){
		buf = strsss+buf;
		strsss = "";
		var tmpstr = buf.split("\n");
		for(var ii=0;ii<tmpstr.length;ii++)
		{
			if(buf.charAt(buf.length-1)!="\n"&&ii==(tmpstr.length-1))
			{
				strsss += tmpstr[ii];
				return;
			}
			writeServerData(tmpstr[ii]);
		}
	});
	sock.on('status', function(str){
		writeToScreen(str);
	});
	sock.on('login', function(str){
		writelogin();
		chatob.html(str+'......<br>');
	});
	sock.on('connected', function(){
		console.log('连接成功。');
	});
	sock.on('disconnect', function(){
		console.log('断开连接。');
	});

	var send = function(str) {
		if(sock) sock.emit('stream', str);
	};
	setTimeout(function(){
		adjustLayout();
		send('\n');
	},200);
});
